import { resolveAdminAuthMode } from './admin-auth-mode';
import { AdminAuthGate } from './components/AdminAuthGate';
import { ContentReviewWorkspace } from './components/ContentReviewWorkspace';

export default function AdminHome() {
  return (
    <AdminAuthGate mode={resolveAdminAuthMode()}>
      <ContentReviewWorkspace />
    </AdminAuthGate>
  );
}
