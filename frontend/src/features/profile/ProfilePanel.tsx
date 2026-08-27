import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../auth/AuthContext';
import type { Locale } from '../../lib/types';
import { useDeactivateAccount, useUpdateProfile } from './api';

export function ProfilePanel() {
  const { t } = useTranslation();
  const { profile, logout, setProfile } = useAuth();
  const updateProfile = useUpdateProfile();
  const deactivate = useDeactivateAccount();

  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [jobTitle, setJobTitle] = useState(profile?.jobTitle ?? '');
  const [locale, setLocale] = useState<Locale>(profile?.locale ?? 'es');
  const [savedMessage, setSavedMessage] = useState(false);

  if (!profile) return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    updateProfile.mutate(
      { fullName, jobTitle, locale },
      {
        onSuccess: (updated) => {
          setProfile(updated);
          void i18n.changeLanguage(updated.locale);
          setSavedMessage(true);
          setTimeout(() => setSavedMessage(false), 2000);
        },
      },
    );
  }

  function handleDeactivate() {
    if (window.confirm(t('profile.confirmDeactivate'))) {
      deactivate.mutate(undefined, { onSuccess: () => void logout() });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <h2 className="font-medium text-slate-900">{t('profile.title')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-3">
          <Avatar name={profile.fullName} size="lg" />
          <div>
            <p className="font-medium text-slate-900">{profile.fullName}</p>
            <p className="text-sm text-slate-500">{profile.jobTitle}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-slate-700">
              {t('profile.fullName')}
            </label>
            <input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="jobTitle" className="block text-sm font-medium text-slate-700">
              {t('profile.jobTitle')}
            </label>
            <input
              id="jobTitle"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="locale" className="block text-sm font-medium text-slate-700">
              {t('profile.locale')}
            </label>
            <select
              id="locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {t('profile.save')}
            </button>
            {savedMessage && <span className="text-sm text-emerald-600">{t('profile.saved')}</span>}
          </div>
        </form>

        <div className="mt-8 space-y-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('profile.logout')}
          </button>
          <button
            type="button"
            onClick={handleDeactivate}
            className="w-full rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            {t('profile.deactivate')}
          </button>
        </div>
      </div>
    </div>
  );
}
