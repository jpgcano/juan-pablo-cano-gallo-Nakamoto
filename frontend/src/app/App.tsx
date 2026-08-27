import { useTranslation } from 'react-i18next';
import { useAuth } from '../features/auth/AuthContext';
import { LoginPage } from '../features/auth/LoginPage';
import { LoadingState } from '../components/StateViews';
import { AppShell } from './AppShell';

export function App() {
  const { t } = useTranslation();
  const { profile, isCheckingSession } = useAuth();

  if (isCheckingSession) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <LoadingState label={t('common.loading')} />
      </div>
    );
  }

  return profile ? <AppShell /> : <LoginPage />;
}
