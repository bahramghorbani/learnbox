import { resolveAdminAuthMode } from './admin-auth-mode';
import { AdminAuthGate } from './components/AdminAuthGate';
import { AdminWorkspaceRouter } from './components/AdminWorkspaceRouter';

export default function AdminHome() {
  return (
    <AdminAuthGate mode={resolveAdminAuthMode()}>
      <AdminWorkspaceRouter />
    </AdminAuthGate>
  );
}
