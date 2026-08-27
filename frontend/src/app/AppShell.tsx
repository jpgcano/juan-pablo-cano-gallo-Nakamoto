import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../features/auth/AuthContext';
import { ChannelList } from '../features/conversations/ChannelList';
import { ConversationView } from '../features/conversations/ConversationView';
import { SocketProvider } from '../features/conversations/SocketProvider';
import { CopilotPanel } from '../features/copilot/CopilotPanel';
import { ProfilePanel } from '../features/profile/ProfilePanel';
import { useMediaQuery } from '../lib/useMediaQuery';

type Zone = 'conversation' | 'copilot' | 'profile';

/**
 * Las tres zonas exigidas por el enunciado: conversacion, copiloto y
 * perfil. En escritorio conviven (lista de canales + conversacion a la
 * izquierda, copiloto/perfil como pestañas a la derecha); en movil son
 * pestañas de pantalla completa. Se renderiza UN solo arbol segun el
 * ancho (no "hidden md:block" en paralelo) para no montar ConversationView
 * dos veces y duplicar peticiones y uniones al socket.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [mobileZone, setMobileZone] = useState<Zone>('conversation');
  const [sidePanel, setSidePanel] = useState<'copilot' | 'profile'>('copilot');

  if (!profile) return null;

  function goToMessage(channelId: string) {
    setSelectedChannelId(channelId);
    setMobileZone('conversation');
  }

  if (isDesktop) {
    return (
      <SocketProvider>
        <div className="flex h-screen">
          <div className="w-72 shrink-0">
            <ChannelList selectedChannelId={selectedChannelId} onSelectChannel={setSelectedChannelId} />
          </div>

          <div className="min-w-0 flex-1">
            <ConversationView channelId={selectedChannelId} currentUserId={profile.id} />
          </div>

          <div className="flex w-96 shrink-0 flex-col border-l border-slate-200">
            <div className="flex border-b border-slate-200 bg-white text-sm">
              <SideTab active={sidePanel === 'copilot'} onClick={() => setSidePanel('copilot')} label={t('nav.copilot')} />
              <SideTab active={sidePanel === 'profile'} onClick={() => setSidePanel('profile')} label={t('nav.profile')} />
            </div>
            <div className="min-h-0 flex-1">
              {sidePanel === 'copilot' ? <CopilotPanel onGoToMessage={goToMessage} /> : <ProfilePanel />}
            </div>
          </div>
        </div>
      </SocketProvider>
    );
  }

  return (
    <SocketProvider>
      <div className="flex h-screen flex-col">
        <div className="min-h-0 flex-1">
          {mobileZone === 'conversation' &&
            (selectedChannelId ? (
              <div className="flex h-full flex-col">
                <button
                  type="button"
                  onClick={() => setSelectedChannelId(null)}
                  className="border-b border-slate-200 bg-white px-4 py-2 text-left text-sm text-slate-500"
                >
                  ← {t('common.back')}
                </button>
                <div className="min-h-0 flex-1">
                  <ConversationView channelId={selectedChannelId} currentUserId={profile.id} />
                </div>
              </div>
            ) : (
              <ChannelList selectedChannelId={null} onSelectChannel={setSelectedChannelId} />
            ))}
          {mobileZone === 'copilot' && <CopilotPanel onGoToMessage={goToMessage} />}
          {mobileZone === 'profile' && <ProfilePanel />}
        </div>

        <nav className="flex border-t border-slate-200 bg-white">
          <TabButton active={mobileZone === 'conversation'} onClick={() => setMobileZone('conversation')} label={t('nav.conversations')} />
          <TabButton active={mobileZone === 'copilot'} onClick={() => setMobileZone('copilot')} label={t('nav.copilot')} />
          <TabButton active={mobileZone === 'profile'} onClick={() => setMobileZone('profile')} label={t('nav.profile')} />
        </nav>
      </div>
    </SocketProvider>
  );
}

function SideTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2.5 font-medium ${active ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400'}`}
    >
      {label}
    </button>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-3 text-xs font-medium ${active ? 'text-slate-900' : 'text-slate-400'}`}
    >
      {label}
    </button>
  );
}
