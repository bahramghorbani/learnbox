import { Pool } from 'pg';

import {
  readAdminContentPacksConfig,
  readAdminContentPacksManageConfig,
  readAdminStoreConfig,
} from './admin-content-packs-config';
import {
  createContentPackCardsRoute,
  createContentPacksListRoute,
} from './admin-content-packs-routes';
import {
  createContentCardCreateRoute,
  createContentCardEditRoute,
  createContentPackCreateRoute,
  createContentPackEditRoute,
} from './admin-content-packs-write-routes';
import {
  createContentImportConfirmRoute,
  createContentImportContractRoute,
  createContentImportPreviewRoute,
  createContentImportTemplateRoute,
} from './admin-content-import-routes';
import {
  createAiAcceptRoute,
  createAiApprovePlanRoute,
  createAiJobStatusRoute,
  createAiModelsRoute,
  createAiPlanRoute,
  createAiRunBatchRoute,
} from './admin-ai-generation-routes';
import {
  createMediaAcceptRoute,
  createMediaAssetRoute,
  createMediaGenerateRoute,
  createMediaModelsRoute,
  createMediaStateRoute,
  createVoicePreviewRoute,
} from './admin-card-media-routes';
import { readAiGenerationConfig } from './ai-generation-provider';
import { readAiMediaConfig } from './ai-media-config';
import { CardMediaGenerationService } from './card-media-generation-service';
import { createDatabaseCardMediaStorage } from './card-media-storage';
import { readCanonicalImageStandard } from './canonical-image-standard';
import { AiPackGenerationService } from './ai-pack-generation-service';
import { ContentImportService } from './content-import-service';
import { readAdminDatabaseConfig, type AdminDatabaseConfig } from './admin-database';
import { getSharedAdminDatabasePool } from './admin-database-pool';
import { PostgresOwnerAuthStore } from './postgres-owner-auth-store';
import { PostgresContentPacksStore } from './postgres-content-packs-store';
import { PostgresContentPacksWriteStore } from './postgres-content-packs-write-store';
import { PostgresContentLifecycleStore } from './postgres-content-lifecycle-store';
import { PostgresStoreListingsStore } from './postgres-store-listings-store';
import { PostgresAdminPaymentsStore } from './postgres-admin-payments-store';
import {
  createAdminPaymentConfigRoute,
  createAdminTransactionsRoute,
} from './admin-payments-routes';
import {
  createStoreListingUpsertRoute,
  createStoreListingsRoute,
} from './admin-store-listing-routes';
import {
  createPackArchiveRoute,
  createPackLifecycleRoute,
  createPackPublishRoute,
  createPackSubmitForReviewRoute,
} from './admin-content-lifecycle-routes';

type Environment = Record<string, string | undefined>;
type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

export function createAdminContentPacksServer(dependencies: {
  environment: Environment;
  createPool(config: AdminDatabaseConfig): DatabasePool;
  now?: () => Date;
}) {
  const config = readAdminContentPacksConfig(dependencies.environment);
  if (!config.enabled) return { enabled: false as const };

  try {
    const pool = dependencies.createPool(readAdminDatabaseConfig(dependencies.environment));
    const sessionStore = new PostgresOwnerAuthStore(pool);
    const store = new PostgresContentPacksStore(pool);
    const shared = {
      enabled: true,
      config,
      sessionStore,
      store,
      now: dependencies.now,
    };
    // Writes carry their own default-off gate; when it is off the mutation routes 404 while the
    // read workspace keeps working.
    const manageConfig = readAdminContentPacksManageConfig(dependencies.environment);
    const writeStore = new PostgresContentPacksWriteStore(pool);
    const writeShared = {
      enabled: manageConfig.enabled,
      config: manageConfig,
      sessionStore,
      store: writeStore,
      now: dependencies.now,
    };
    // Bulk import rides the same manage gate and the same canonical write store, so it can never
    // become a second content path with its own rules.
    const importService = new ContentImportService(pool, writeStore);
    const importShared = {
      enabled: manageConfig.enabled,
      config: manageConfig,
      sessionStore,
      service: importService,
      now: dependencies.now,
    };
    // AI generation (M1.4) rides the same manage gate AND its own default-off flag, and reaches
    // canonical content only through the import service above. With no provider credential the
    // routes stay authenticated but answer an honest 503 instead of inventing cards.
    const aiConfig = readAiGenerationConfig(dependencies.environment);
    const aiShared = {
      enabled: manageConfig.enabled && aiConfig.enabled,
      config: manageConfig,
      sessionStore,
      // The service is built whenever the FEATURE is on, with or without a credential: inspecting
      // and accepting an already-generated job must not depend on the provider. The two routes
      // that do call the provider answer an honest 503 when it is absent.
      service: aiConfig.enabled
        ? new AiPackGenerationService(
            pool,
            aiConfig.provider,
            aiConfig.limits,
            importService,
            writeStore,
          )
        : undefined,
      // Only the model-catalog route needs the provider itself; it is the sole holder of the key.
      provider: aiConfig.enabled ? aiConfig.provider : undefined,
      now: dependencies.now,
    };
    // AI media generation (M1.5) rides the same manage gate AND its own default-off flag. The
    // canonical image standard and the canonical article/voice rules are loaded here once, so every
    // route shares exactly one definition of each.
    const mediaConfig = readAiMediaConfig(dependencies.environment);
    const mediaProvider = 'provider' in mediaConfig ? mediaConfig.provider : undefined;
    const mediaShared = {
      enabled: manageConfig.enabled && mediaConfig.enabled,
      config: manageConfig,
      sessionStore,
      service:
        mediaProvider && 'voices' in mediaConfig
          ? new CardMediaGenerationService(
              pool,
              mediaProvider,
              createDatabaseCardMediaStorage(pool),
              mediaConfig.voices,
              mediaConfig.limits,
              readCanonicalImageStandard(),
            )
          : undefined,
      provider: mediaProvider,
      voices: 'voices' in mediaConfig ? mediaConfig.voices : undefined,
      audioTimeoutMs: 'limits' in mediaConfig ? mediaConfig.limits.audioTimeoutMs : undefined,
      now: dependencies.now,
    };
    // Lifecycle (M1.6) rides the same manage gate and writes only canonical `packs` /
    // `card_versions` rows, so Admin publish and learner visibility cannot diverge.
    const lifecycleStore = new PostgresContentLifecycleStore(pool);
    const lifecycleShared = {
      enabled: manageConfig.enabled,
      config: manageConfig,
      sessionStore,
      store: lifecycleStore,
      now: dependencies.now,
    };
    // Store (M2.1) carries its OWN default-off gate rather than riding the content manage flag,
    // because commercial availability is a different authority from content authoring. It writes
    // only `store_listings` and reads canonical packs, so the Store can never become a second
    // source of truth for pack or card content.
    const storeConfig = readAdminStoreConfig(dependencies.environment);
    const storeShared = {
      enabled: storeConfig.enabled,
      config: storeConfig,
      sessionStore,
      store: new PostgresStoreListingsStore(pool),
      now: dependencies.now,
    };
    // Payments (M2.4) are read-only operations: transaction inspection and gateway configuration
    // status. They ride the Store gate because a shop without a way to see its payments is not
    // operable, and they add no write path — the merchant credential is server-provisioned and
    // this store never reads it.
    const paymentsShared = {
      enabled: storeConfig.enabled,
      config: storeConfig,
      sessionStore,
      store: new PostgresAdminPaymentsStore(pool),
      now: dependencies.now,
      environment: dependencies.environment,
    };
    return {
      enabled: true as const,
      manageEnabled: manageConfig.enabled,
      list: createContentPacksListRoute({
        ...shared,
        manageEnabled: manageConfig.enabled,
        // Reported to the workspace only when a real provider is available, so the Admin is never
        // offered a generation button that cannot generate.
        aiEnabled: aiShared.enabled && aiConfig.enabled && aiConfig.provider !== undefined,
        // Offered to the workspace only with a real provider, so the Admin never sees a media
        // button that cannot generate.
        mediaEnabled: mediaShared.enabled && mediaProvider !== undefined,
      }),
      cards: createContentPackCardsRoute(shared),
      createPack: createContentPackCreateRoute(writeShared),
      editPack: createContentPackEditRoute(writeShared),
      createCard: createContentCardCreateRoute(writeShared),
      editCard: createContentCardEditRoute(writeShared),
      importPreview: createContentImportPreviewRoute(importShared),
      importConfirm: createContentImportConfirmRoute(importShared),
      importTemplate: createContentImportTemplateRoute(importShared),
      importContract: createContentImportContractRoute(importShared),
      aiEnabled: aiShared.enabled,
      aiModels: createAiModelsRoute(aiShared),
      aiPlan: createAiPlanRoute(aiShared),
      aiApprovePlan: createAiApprovePlanRoute(aiShared),
      aiRunBatch: createAiRunBatchRoute(aiShared),
      aiJobStatus: createAiJobStatusRoute(aiShared),
      aiAccept: createAiAcceptRoute(aiShared),
      mediaEnabled: mediaShared.enabled && mediaProvider !== undefined,
      mediaModels: createMediaModelsRoute(mediaShared),
      mediaState: createMediaStateRoute(mediaShared),
      mediaGenerate: createMediaGenerateRoute(mediaShared),
      mediaAccept: createMediaAcceptRoute(mediaShared),
      mediaAsset: createMediaAssetRoute(mediaShared),
      mediaVoicePreview: createVoicePreviewRoute(mediaShared),
      lifecycleEnabled: manageConfig.enabled,
      packLifecycle: createPackLifecycleRoute(lifecycleShared),
      submitPackForReview: createPackSubmitForReviewRoute(lifecycleShared),
      publishPack: createPackPublishRoute(lifecycleShared),
      archivePack: createPackArchiveRoute(lifecycleShared),
      storeEnabled: storeConfig.enabled,
      storeListings: createStoreListingsRoute(storeShared),
      upsertStoreListing: createStoreListingUpsertRoute(storeShared),
      transactions: createAdminTransactionsRoute(paymentsShared),
      paymentConfiguration: createAdminPaymentConfigRoute(paymentsShared),
    };
  } catch {
    return { enabled: false as const };
  }
}

export function getAdminContentPacksServer() {
  return createAdminContentPacksServer({
    environment: process.env,
    createPool: (config) =>
      getSharedAdminDatabasePool(config, (poolConfig) => new Pool(poolConfig)),
  });
}
