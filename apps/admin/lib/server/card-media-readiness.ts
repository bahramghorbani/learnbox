import {
  CARD_MEDIA_KINDS,
  type CardMediaKind,
  type CardMediaReadiness,
  type GermanVoiceMapping,
  type MediaValidity,
  type PinnedCardMedia,
  evaluateMediaValidity,
  readCardMediaReferences,
  sameMediaInputs,
} from '@learnbox/content-models';

import { readCanonicalCardBrief, readCanonicalImageStandard } from './canonical-image-standard';

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult> };

export interface MediaReadinessInput {
  cardId: string;
  cardVersionId: string;
  contentId: string;
  content: Record<string, unknown>;
}

export interface ResolvedCardMedia {
  media: CardMediaReadiness[];
  /** Accepted, valid Admin media to pin into the version when it is published. */
  pins: PinnedCardMedia[];
  imageBrief: string | null;
}

interface CandidateRow {
  id: string;
  cardId: string;
  kind: CardMediaKind;
  objectKey: string | null;
  checksum: string | null;
  mediaType: string | null;
  spokenTarget: string | null;
  voice: string | null;
  voiceRole: string | null;
  imageSubject: string | null;
  imageStandardVersion: string | null;
}

function toCandidateRow(row: Record<string, unknown>): CandidateRow {
  const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
  return {
    id: String(row.id),
    cardId: String(row.card_id),
    kind: row.kind as CardMediaKind,
    objectKey: text(row.object_key),
    checksum: text(row.checksum),
    mediaType: text(row.media_type),
    spokenTarget: text(row.spoken_target),
    voice: text(row.voice),
    voiceRole: text(row.voice_role),
    imageSubject: text(row.image_subject),
    imageStandardVersion: text(row.image_standard_version),
  };
}

const COLUMNS = `c.id, c.card_id, c.kind, c.object_key, c.checksum, c.media_type, c.spoken_target,
  c.voice, c.voice_role, c.image_subject, c.image_standard_version`;

/**
 * Resolves, for each card version, whether its image, word audio and sentence audio are ready to
 * publish — from the media's real source, never from a flag in the card JSON:
 *
 *  1. an accepted Admin candidate (`card_media_assets`) is checked against the version's text;
 *  2. otherwise a ready candidate awaiting acceptance is reported as `pending_acceptance`;
 *  3. otherwise a reference already carried in the version (bundled Starter file, a previously
 *     pinned candidate) is valid only when a previously published version of the same card held
 *     the same reference and needed the same inputs for that medium (same spoken text and voice
 *     role, or same image subject). Nothing is assumed for a reference with no published history.
 *
 * Read-only: callers inside a transaction pass their client so the decision uses locked rows.
 */
export async function resolveCardMediaReadiness(
  client: Queryable,
  versions: readonly MediaReadinessInput[],
  voiceMapping: GermanVoiceMapping,
): Promise<Map<string, ResolvedCardMedia>> {
  const result = new Map<string, ResolvedCardMedia>();
  if (versions.length === 0) return result;
  const cardIds = [...new Set(versions.map((version) => version.cardId))];
  const imageStandardVersion = readCanonicalImageStandard().version;

  const [acceptedRows, readyRows, publishedRows] = await Promise.all([
    client.query(
      `SELECT ${COLUMNS}
         FROM card_media_assets a
         JOIN card_media_candidates c ON c.id = a.candidate_id
        WHERE a.card_id = ANY($1::uuid[])`,
      [cardIds],
    ),
    client.query(
      `SELECT DISTINCT ON (c.card_id, c.kind) ${COLUMNS}
         FROM card_media_candidates c
        WHERE c.card_id = ANY($1::uuid[]) AND c.status = 'ready'
        ORDER BY c.card_id, c.kind, c.created_at DESC`,
      [cardIds],
    ),
    client.query(
      `SELECT card_id, id, content_json
         FROM card_versions
        WHERE card_id = ANY($1::uuid[]) AND status IN ('published', 'deprecated')
        ORDER BY version DESC`,
      [cardIds],
    ),
  ]);
  const accepted = acceptedRows.rows.map(toCandidateRow);
  const ready = readyRows.rows.map(toCandidateRow);

  for (const version of versions) {
    const imageBrief = readCanonicalCardBrief(version.contentId) ?? null;
    const validityOf = (row: CandidateRow): MediaValidity =>
      evaluateMediaValidity(row, version.content, {
        imageBrief,
        imageStandardVersion,
        voiceMapping,
      });
    const carried = readCardMediaReferences(version.content.media).references;
    const history = publishedRows.rows
      .filter((row) => String(row.card_id) === version.cardId)
      .map((row) => (row.content_json ?? {}) as Record<string, unknown>);

    const media: CardMediaReadiness[] = [];
    const pins: PinnedCardMedia[] = [];
    for (const kind of CARD_MEDIA_KINDS) {
      const acceptedRow = accepted.find(
        (row) => row.cardId === version.cardId && row.kind === kind,
      );
      if (acceptedRow) {
        const state = validityOf(acceptedRow);
        media.push({ kind, state, source: 'admin_candidate' });
        if (
          state === 'valid' &&
          acceptedRow.objectKey &&
          acceptedRow.checksum &&
          acceptedRow.mediaType
        ) {
          pins.push({
            kind,
            assetId: `${version.contentId}-${kind}-${acceptedRow.id}`,
            candidateId: acceptedRow.id,
            objectKey: acceptedRow.objectKey,
            checksum: acceptedRow.checksum,
            mediaType: acceptedRow.mediaType,
            qualityStatus: 'approved',
          });
        }
        continue;
      }
      const readyRow = ready.find((row) => row.cardId === version.cardId && row.kind === kind);
      if (readyRow && validityOf(readyRow) === 'valid') {
        media.push({ kind, state: 'pending_acceptance', source: 'admin_candidate' });
        continue;
      }
      const reference = carried.find((entry) => entry.kind === kind);
      if (reference) {
        const proven = history.some(
          (previous) =>
            readCardMediaReferences(previous.media).references.some(
              (entry) => entry.kind === kind && entry.assetId === reference.assetId,
            ) && sameMediaInputs(kind, version.content, previous, { imageBrief }),
        );
        media.push({
          kind,
          state: proven ? 'valid' : 'unverifiable',
          source: reference.source === 'pinned' ? 'admin_candidate' : reference.source,
        });
        continue;
      }
      media.push({ kind, state: readyRow ? 'stale' : 'missing' });
    }
    result.set(version.cardVersionId, { media, pins, imageBrief });
  }
  return result;
}
