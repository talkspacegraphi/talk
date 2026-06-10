import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  Edit3,
  Check,
  Loader2,
  Trash2,
  Calendar,
  AtSign,
} from 'lucide-react';
import { api } from '../../lib/api';
import DatePicker from '../DatePicker';
import type { SideMenuContext } from './types';

interface ProfileViewProps {
  ctx: SideMenuContext;
}

export default function ProfileView({ ctx }: ProfileViewProps) {
  const { user, updateUser, t, lang, changeView } = ctx;

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [birthday, setBirthday] = useState(user?.birthday || '');
  const [isSaving, setIsSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = (user?.displayName || user?.username || '??')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const updated = await api.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        birthday: birthday || undefined,
      });
      updateUser(updated);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatarUploading(true);
      const updated = await api.uploadAvatar(file);
      updateUser(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      setAvatarUploading(true);
      await api.removeAvatar();
      updateUser({ avatar: null });
    } catch (err) {
      console.error(err);
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <motion.div key="profile" className="flex flex-col h-full" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }} transition={{ duration: 0.2 }}>
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5 relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-vortex-500/20 to-purple-500/10 pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <button onClick={() => { changeView('main'); setIsEditing(false); }} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-lg font-bold tracking-tight text-white drop-shadow-sm">{t('myProfile')}</h3>
        </div>
        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} className="relative z-10 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all border border-white/5">
            <Edit3 size={16} />
          </button>
        ) : (
          <button onClick={handleSave} disabled={isSaving} className="relative z-10 p-2 rounded-full text-vortex-400 hover:text-vortex-300 hover:bg-vortex-500/10 transition-all border border-vortex-500/20">
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar section */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6 relative overflow-visible">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-vortex-500/10 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-accent via-purple-500 to-accent rounded-full opacity-50 blur group-hover:opacity-75 transition duration-500 animate-[spin_4s_linear_infinite]" />

            <div className="relative">
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-28 h-28 rounded-full object-cover ring-4 ring-surface bg-surface" />
              ) : (
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-surface to-surface-secondary flex items-center justify-center text-white font-bold text-3xl ring-4 ring-surface relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-purple-500/20" />
                  <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400 drop-shadow-md">{initials}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-x-1 bottom-1 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-xs font-medium text-white transition-all transform translate-y-2 group-hover:translate-y-0"
            >
              {avatarUploading ? (
                <Loader2 size={14} className="text-vortex-400 animate-spin" />
              ) : (
                <Camera size={14} className="text-vortex-400" />
              )}
            </button>

            {user?.avatar && (
              <button
                onClick={handleRemoveAvatar}
                disabled={avatarUploading}
                className="absolute h-7 px-2.5 -top-1 left-1/2 -translate-x-1/2 bg-red-500/80 backdrop-blur-md hover:bg-red-500 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-400/30 transform -translate-y-2 group-hover:translate-y-0"
              >
                <Trash2 size={10} className="text-white" />
                <span className="text-[10px] font-semibold text-white">{t('removePhoto')}</span>
              </button>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>

          {/* Name */}
          {isEditing ? (
            <div className="mt-5 w-full max-w-[260px] relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-vortex-500 to-purple-500 rounded-2xl opacity-50 blur-sm pointer-events-none" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('enterName')}
                className="relative text-lg font-bold text-center text-white bg-black/40 border border-white/20 outline-none px-4 py-2.5 w-full rounded-2xl transition-colors focus:bg-black/60 focus:border-vortex-400 placeholder-white/30"
              />
            </div>
          ) : (
            <h3 className="mt-4 text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-white/70 tracking-tight text-center px-4">
              {user?.displayName || user?.username}
            </h3>
          )}

          {/* Username badge */}
          <div className="flex items-center gap-1.5 mt-2 bg-vortex-500/10 hover:bg-vortex-500/20 transition-colors px-3.5 py-1.5 rounded-full border border-vortex-500/20 backdrop-blur-sm cursor-default">
            <AtSign size={13} className="text-vortex-400" />
            <span className="text-sm font-semibold text-vortex-100">{user?.username}</span>
          </div>
        </div>

        {/* Info cards */}
        <div className="px-4 space-y-2.5 pb-6">
          {/* About */}
          <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 transition-all hover:bg-zinc-800 hover:border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-vortex-500/20 flex items-center justify-center border border-vortex-500/30">
                <Edit3 size={12} className="text-vortex-400" />
              </div>
              <span className="text-xs font-semibold text-vortex-200/50 uppercase tracking-widest">{t('aboutMe')}</span>
            </div>
            {isEditing ? (
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full rounded-xl bg-black/40 text-sm text-white placeholder-white/30 p-3 border border-white/10 focus:border-vortex-500 transition-colors resize-none outline-none leading-relaxed"
                placeholder={t('tellAboutYourself')}
              />
            ) : (
              <p className="text-sm text-zinc-200 leading-relaxed pl-1">
                {user?.bio || <span className="text-white/30 italic">{t('notSpecified')}</span>}
              </p>
            )}
          </div>

          {/* Birthday */}
          <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 transition-all hover:bg-zinc-800 hover:border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                <Calendar size={12} className="text-orange-400" />
              </div>
              <span className="text-xs font-semibold text-orange-200/50 uppercase tracking-widest">{t('birthday')}</span>
            </div>
            {isEditing ? (
              <DatePicker value={birthday} onChange={setBirthday} />
            ) : (
              <p className="text-sm text-zinc-200 pl-1">
                {user?.birthday ? (
                  new Date(user.birthday).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
                ) : (
                  <span className="text-white/30 italic">{t('notSpecified')}</span>
                )}
              </p>
            )}
          </div>

          {/* Member since */}
          {user?.createdAt && (
            <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 transition-all hover:bg-zinc-800 hover:border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <Check size={12} className="text-emerald-400" />
                </div>
                <span className="text-xs font-semibold text-emerald-200/50 uppercase tracking-widest">{t('onVortexSince')}</span>
              </div>
              <p className="text-sm text-zinc-200 pl-1">
                {new Date(user.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {isEditing && (
          <div className="px-4 pb-6 flex gap-3">
            <button
              onClick={() => { setIsEditing(false); setDisplayName(user?.displayName || ''); setBio(user?.bio || ''); setBirthday(user?.birthday || ''); }}
              className="flex-1 py-3 rounded-xl bg-black/20 hover:bg-black/40 border border-white/5 text-sm font-semibold text-zinc-300 hover:text-white transition-all backdrop-blur-md"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-vortex-500 to-purple-600 hover:from-vortex-600 hover:to-purple-700 text-sm font-bold text-white transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)] flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {t('save')}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
