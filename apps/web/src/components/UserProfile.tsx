import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, AtSign, Edit3, Check, Loader2, Image as ImageIcon, FileText, Link as LinkIcon, Download, ExternalLink, Play, UserPlus, UserMinus, UserCheck, Clock, Ban, MessageSquare, Phone, Video, Volume2, VolumeX } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useLang } from '../lib/i18n';
import { User, Message, FriendshipStatus, UserBasic } from '../lib/types';
import ImageLightbox from './ImageLightbox';
import { getSocket } from '../lib/socket';
import { useChatStore } from '../stores/chatStore';
import { useToastStore } from '../stores/toastStore';

interface UserProfileProps {
  userId: string;
  chatId?: string;
  onClose: () => void;
  isSelf?: boolean;
  onStartCall?: (targetUser: UserBasic, type: 'voice' | 'video') => void;
}

type MediaTab = 'media' | 'files' | 'links';

export default function UserProfile({ userId, chatId, onClose, isSelf, onStartCall }: UserProfileProps) {
  const { user: authUser } = useAuthStore();
  const { setActiveChat, chats } = useChatStore();
  const { t, lang } = useLang();
  const { showToast } = useToastStore();
  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MediaTab>('media');
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Shared media state
  const [sharedMedia, setSharedMedia] = useState<Message[]>([]);
  const [sharedFiles, setSharedFiles] = useState<Message[]>([]);
  const [sharedLinks, setSharedLinks] = useState<Array<Message & { links?: string[] }>>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<Set<MediaTab>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Friend state
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus | null>(null);
  const [friendLoading, setFriendLoading] = useState(false);

  // Block state
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [deleteChat, setDeleteChat] = useState(false);

  // Mute state
  const [isMuted, setIsMuted] = useState(false);

  // Link confirmation state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [pendingLink, setPendingLink] = useState<string | null>(null);

  // Copy notification state
  const [showCopyNotification, setShowCopyNotification] = useState(false);

  useEffect(() => {
    loadProfile();
    if (!isSelf) {
      api.getFriendshipStatus(userId).then(setFriendStatus).catch(() => {});
      api.isUserBlocked(userId).then(data => setIsBlocked(data.blocked)).catch(() => {});
    }

    // Load mute status from chat
    if (chatId && authUser) {
      const chat = chats.find(c => c.id === chatId);
      if (chat) {
        const member = chat.members.find(m => m.userId === authUser.id);
        if (member && member.isMuted !== undefined) {
          setIsMuted(member.isMuted);
        }
      }
    }
  }, [userId, chatId, chats, authUser]);

  // Load shared media/files/links when tab changes
  const loadTabData = useCallback(async (tab: MediaTab) => {
    if (loadedTabs.has(tab)) return;
    setTabLoading(true);
    try {
      if (tab === 'links') {
        // Load links from new endpoint
        const data = await api.getUserLinks(userId);
        setSharedLinks(data.map(link => ({
          id: link.id,
          chatId: link.chatId,
          senderId: link.userId,
          content: link.url,
          type: 'text',
          createdAt: link.createdAt,
          updatedAt: link.createdAt,
          isEdited: false,
          isDeleted: false,
          links: [link.url],
          sender: profile || authUser!,
          chat: { id: link.chatId, type: 'personal', createdAt: link.createdAt, members: [], messages: [] },
          media: [],
          reactions: [],
          readBy: [],
          replies: [],
        } as any)));
      } else if (chatId) {
        const data = await api.getSharedMedia(chatId, tab);
        if (tab === 'media') setSharedMedia(data);
        else if (tab === 'files') setSharedFiles(data);
      }
      setLoadedTabs(prev => new Set(prev).add(tab));
    } catch (e) {
      console.error('Failed to load shared', tab, e);
    } finally {
      setTabLoading(false);
    }
  }, [userId, chatId, loadedTabs, profile, authUser]);

  useEffect(() => {
    loadTabData(activeTab);
  }, [activeTab, loadTabData]);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      if (isSelf && authUser) {
        setProfile(authUser);
      } else {
        const data = await api.getUser(userId);
        setProfile(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendFriendRequest = async () => {
    try {
      setFriendLoading(true);
      const result = await api.sendFriendRequest(userId);
      if (result.status === 'accepted') {
        setFriendStatus({ status: 'accepted', friendshipId: null });
      } else {
        setFriendStatus({ status: 'pending', friendshipId: null, direction: 'outgoing' });
      }
      // Notify via socket
      const socket = getSocket();
      if (socket) socket.emit('friend_request', { friendId: userId });
    } catch (e) {
      console.error(e);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleAcceptFriend = async () => {
    if (!friendStatus?.friendshipId) return;
    try {
      setFriendLoading(true);
      await api.acceptFriendRequest(friendStatus.friendshipId);
      setFriendStatus({ status: 'accepted', friendshipId: friendStatus.friendshipId });
      const socket = getSocket();
      if (socket) socket.emit('friend_accepted', { friendId: userId });
    } catch (e) {
      console.error(e);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!friendStatus?.friendshipId) return;
    try {
      setFriendLoading(true);
      await api.removeFriend(friendStatus.friendshipId);
      setFriendStatus({ status: 'none', friendshipId: null });
      const socket = getSocket();
      if (socket) socket.emit('friend_removed', { friendId: userId });
    } catch (e) {
      console.error(e);
    } finally {
      setFriendLoading(false);
    }
  };

  const handleBlockUser = async () => {
    try {
      setBlockLoading(true);

      // Remove friendship if exists
      if (friendStatus?.status === 'accepted' && friendStatus.friendshipId) {
        await api.removeFriend(friendStatus.friendshipId);
        const socket = getSocket();
        if (socket) socket.emit('friend_removed', { friendId: userId });
      }

      // Block user
      await api.blockUser(userId);
      setIsBlocked(true);
      setFriendStatus(null);

      const socket = getSocket();
      if (socket) socket.emit('user_blocked', { userId });

      // Delete chat if requested
      if (deleteChat && chatId) {
        await api.deleteChat(chatId);
        onClose();
      }

      setShowBlockModal(false);
      setDeleteChat(false);
    } catch (e) {
      console.error(e);
    } finally {
      setBlockLoading(false);
    }
  };

  const handleUnblockUser = async () => {
    try {
      setBlockLoading(true);
      await api.unblockUser(userId);
      setIsBlocked(false);
      const socket = getSocket();
      if (socket) socket.emit('user_unblocked', { userId });
    } catch (e) {
      console.error(e);
    } finally {
      setBlockLoading(false);
    }
  };

  const handleOpenChat = () => {
    if (chatId) {
      setActiveChat(chatId);
      onClose();
    }
  };

  const handleToggleMute = async () => {
    if (!chatId) return;

    try {
      const result = await api.toggleMuteChat(chatId);
      setIsMuted(result.isMuted);
      showToast(result.isMuted ? 'Уведомления отключены' : 'Уведомления включены', 'success');
    } catch (error) {
      showToast('Произошла ошибка', 'error');
    }
  };

  const handleVoiceCall = () => {
    if (profile && onStartCall) {
      const targetUser: UserBasic = {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.avatar,
      };
      onStartCall(targetUser, 'voice');
      onClose();
    }
  };

  const handleVideoCall = () => {
    if (profile && onStartCall) {
      const targetUser: UserBasic = {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.avatar,
      };
      onStartCall(targetUser, 'video');
      onClose();
    }
  };

  const handleCopyUsername = () => {
    if (profile) {
      navigator.clipboard.writeText(profile.username);
      setShowCopyNotification(true);
      setTimeout(() => setShowCopyNotification(false), 2000);
    }
  };

  const initials = (profile?.displayName || profile?.username || '??')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tabs: { key: MediaTab; label: string; icon: React.ElementType }[] = [
    { key: 'media', label: t('mediaTab'), icon: ImageIcon },
    { key: 'files', label: t('filesTab'), icon: FileText },
    { key: 'links', label: t('linksTab'), icon: LinkIcon },
  ];

  const profileContent = (
    <>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-vortex-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : profile ? (
        <div className="flex-1 overflow-y-auto">
          {/* Аватар и основная информация */}
          <div className="flex flex-col items-center pt-8 pb-6 px-6">
            <div className="relative">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt=""
                  className="w-28 h-28 rounded-full object-cover ring-4 ring-surface-secondary"
                />
              ) : (
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl ring-4 ring-surface-secondary">
                  {initials}
                </div>
              )}

              {profile.isOnline && (
                <div className="absolute bottom-1 right-1 w-6 h-6 bg-emerald-500 rounded-full border-4 border-surface-secondary" />
              )}
            </div>

            {/* Имя */}
            <h3 className="mt-4 text-2xl font-bold text-white text-center">
              {profile.displayName || profile.username}
            </h3>

            {/* Username */}
            <button
              onClick={handleCopyUsername}
              className="flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 transition-all group cursor-pointer"
            >
              <AtSign size={14} className="text-blue-400 group-hover:text-blue-300 transition-colors" />
              <span className="text-sm text-blue-400 group-hover:text-blue-300 transition-colors">{profile.username}</span>
            </button>

            {/* Статус */}
            <p className="text-xs text-zinc-500 mt-2">
              {profile.isOnline ? t('online') : t('wasRecently')}
            </p>
          </div>

          {/* Кнопки действий (только для других пользователей) */}
          {!isSelf && (
            <div className="px-6 pb-6">
              <div className="grid grid-cols-4 gap-2">
                {/* Чат */}
                <button
                  onClick={handleOpenChat}
                  disabled={!chatId}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-zinc-500/10 hover:bg-zinc-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MessageSquare size={20} className="text-zinc-300" />
                  <span className="text-xs font-medium text-zinc-300">Чат</span>
                </button>

                {/* Уведомления (Mute/Unmute) */}
                <button
                  onClick={handleToggleMute}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-zinc-500/10 hover:bg-zinc-500/20 transition-all"
                >
                  {isMuted ? <VolumeX size={20} className="text-zinc-300" /> : <Volume2 size={20} className="text-zinc-300" />}
                  <span className="text-xs font-medium text-zinc-300">{isMuted ? 'Вкл' : 'Выкл'}</span>
                </button>

                {/* Голосовой звонок */}
                <button
                  onClick={handleVoiceCall}
                  className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-zinc-500/10 hover:bg-zinc-500/20 transition-all"
                >
                  <Phone size={20} className="text-zinc-300" />
                  <span className="text-xs font-medium text-zinc-300">Звонок</span>
                </button>

                {/* Заблокировать / Разблокировать */}
                {isBlocked ? (
                  <button
                    onClick={handleUnblockUser}
                    disabled={blockLoading}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-zinc-500/10 hover:bg-zinc-500/20 transition-all"
                  >
                    {blockLoading ? <Loader2 size={20} className="animate-spin text-zinc-300" /> : <Ban size={20} className="text-zinc-300" />}
                    <span className="text-xs font-medium text-zinc-300">Разблок</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowBlockModal(true)}
                    disabled={blockLoading}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-all"
                  >
                    {blockLoading ? <Loader2 size={20} className="animate-spin text-red-400" /> : <Ban size={20} className="text-red-400" />}
                    <span className="text-xs font-medium text-red-400">Блок</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Информация */}
          <div className="px-6 pb-6 space-y-3">
            {/* О себе */}
            <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 transition-all hover:bg-zinc-800 hover:border-white/10 group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-vortex-500/20 flex items-center justify-center border border-vortex-500/30">
                  <Edit3 size={12} className="text-vortex-400" />
                </div>
                <label className="text-xs font-semibold text-vortex-200/50 uppercase tracking-widest">
                  {t('aboutMe')}
                </label>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed pl-1">
                {profile.bio || (
                  <span className="text-white/30 italic">{t('notSpecified')}</span>
                )}
              </p>
            </div>

            {/* Дата рождения */}
            {profile.birthday && (
              <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 transition-all hover:bg-zinc-800 hover:border-white/10 group">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                    <Calendar size={12} className="text-orange-400" />
                  </div>
                  <label className="text-xs font-semibold text-orange-200/50 uppercase tracking-widest">
                    {t('birthday')}
                  </label>
                </div>
                <p className="text-sm text-zinc-200 pl-1">
                  {profile.birthday ? (
                    new Date(profile.birthday).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  ) : (
                    <span className="text-white/30 italic">{t('notSpecified')}</span>
                  )}
                </p>
              </div>
            )}

            {/* Дата регистрации */}
            <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 transition-all hover:bg-zinc-800 hover:border-white/10 group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                  <Check size={12} className="text-emerald-400" />
                </div>
                <label className="text-xs font-semibold text-emerald-200/50 uppercase tracking-widest">
                  {t('onVortexSince')}
                </label>
              </div>
              <p className="text-sm text-zinc-200 pl-1">
                {new Date(profile.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Медиа / Файлы / Ссылки */}
          <div className="border-t border-white/5 bg-zinc-900 mt-2">
            <div className="flex px-2 pt-2 gap-1 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 text-xs font-bold transition-all rounded-t-xl min-w-[100px] ${activeTab === tab.key
                    ? 'bg-white/10 text-white shadow-[inset_0_2px_10px_rgba(255,255,255,0.05)] border-t border-x border-white/10'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                    }`}
                >
                  <tab.icon size={14} className={activeTab === tab.key ? 'text-vortex-400' : 'opacity-70'} />
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="min-h-[160px] bg-white/[0.02] border-t border-white/5 relative">
              {tabLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-zinc-500" />
                </div>
              ) : activeTab === 'media' ? (
                sharedMedia.length > 0 ? (
                  <div className="grid grid-cols-3 gap-0.5 p-1">
                    {(() => {
                      const allMedia = sharedMedia.flatMap((msg) => (msg.media || []));
                      return allMedia.map((m, idx) => (
                        <div
                          key={m.id}
                          onClick={() => setLightboxIndex(idx)}
                          className="relative aspect-square bg-zinc-900 overflow-hidden group cursor-pointer"
                        >
                          {m.type === 'video' ? (
                            <>
                              <img
                                src={m.thumbnail || m.url}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <Play size={24} className="text-white fill-white" />
                              </div>
                            </>
                          ) : (
                            <img
                              src={m.url}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-xs text-zinc-600 italic">{t('sharedPhotos')}</p>
                  </div>
                )
              ) : activeTab === 'files' ? (
                sharedFiles.length > 0 ? (
                  <div className="divide-y divide-border">
                    {sharedFiles.flatMap((msg) =>
                      (msg.media || []).map((m) => (
                        <a
                          key={m.id}
                          href={m.url}
                          download={m.filename || 'file'}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group/file"
                        >
                          <div className="w-10 h-10 rounded-xl bg-vortex-500/20 flex items-center justify-center flex-shrink-0 border border-vortex-500/30 group-hover/file:scale-105 transition-transform">
                            <FileText size={18} className="text-vortex-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{m.filename || 'file'}</p>
                            <p className="text-xs text-zinc-500">
                              {m.size ? `${(m.size / 1024).toFixed(1)} KB` : ''}
                              {msg.sender ? ` · ${msg.sender.displayName || msg.sender.username}` : ''}
                            </p>
                          </div>
                          <Download size={16} className="text-zinc-500 flex-shrink-0" />
                        </a>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-xs text-zinc-600 italic">{t('sharedFiles')}</p>
                  </div>
                )
              ) : (
                sharedLinks.length > 0 ? (
                  <div className="divide-y divide-border">
                    {sharedLinks.map((msg) => (
                      <div key={msg.id} className="px-4 py-3 hover:bg-white/5 transition-colors">
                        <p className="text-xs text-zinc-500 mb-1.5 font-medium">
                          {msg.sender?.displayName || msg.sender?.username} · {new Date(msg.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}
                        </p>
                        {(msg.links || []).map((link: string, i: number) => (
                          <button
                            key={i}
                            onClick={(e) => {
                              e.preventDefault();
                              setPendingLink(link);
                              setShowLinkModal(true);
                            }}
                            className="flex items-center gap-2 text-sm text-vortex-400 hover:text-vortex-300 transition-colors truncate w-full text-left"
                          >
                            <ExternalLink size={14} className="flex-shrink-0" />
                            <span className="truncate">{link}</span>
                          </button>
                        ))}
                        {msg.content && (
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{msg.content}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-xs text-zinc-600 italic">{t('sharedLinks')}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-500">
          {t('profileNotFound')}
        </div>
      )}
    </>
  );

  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setShowPanel(true));
  }, []);

  const handleClose = () => {
    setShowPanel(false);
    setTimeout(onClose, 300);
  };

  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-0 z-[9999] flex flex-col transition-transform duration-300 ease-out"
          style={{
            backgroundColor: '#18181b',
            transform: showPanel ? 'translateY(0)' : 'translateY(100%)',
          }}
        >
          {/* Шапка */}
          <div className="flex items-center justify-between p-5 border-b border-border/50 flex-shrink-0">
            <h2 className="text-lg font-bold text-white">
              {isSelf ? t('myProfile') : t('profileTitle')}
            </h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          {profileContent}
        </div>

        {/* Media lightbox gallery */}
        <AnimatePresence>
          {lightboxIndex !== null && (
            <ImageLightbox
              images={sharedMedia.flatMap((msg) => (msg.media || []).map((m) => ({ url: m.url, type: m.type })))}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </AnimatePresence>

        {/* Block confirmation modal */}
        <AnimatePresence>
          {showBlockModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                onClick={() => setShowBlockModal(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[101]"
              >
                <div className="bg-surface-secondary border border-border rounded-2xl shadow-2xl p-6 mx-4">
                  <h3 className="text-lg font-semibold text-white mb-4">{t('blockUserConfirm')}</h3>
                  {chatId && (
                    <label className="flex items-start gap-3 mb-6 cursor-pointer group p-3 rounded-xl hover:bg-white/5 transition-colors">
                      <div className="relative flex items-center justify-center mt-0.5">
                        <input
                          type="checkbox"
                          checked={deleteChat}
                          onChange={(e) => setDeleteChat(e.target.checked)}
                          className="peer w-5 h-5 rounded-md border-2 border-zinc-600 bg-transparent appearance-none cursor-pointer transition-all checked:bg-accent checked:border-accent"
                        />
                        <Check size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors block">{t('alsoDeleteChat')}</span>
                        <span className="text-xs text-zinc-500 mt-1 block">{t('chatHistoryWillBeDeleted')}</span>
                      </div>
                    </label>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setShowBlockModal(false); setDeleteChat(false); }} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all text-sm font-medium">{t('cancel')}</button>
                    <button onClick={handleBlockUser} disabled={blockLoading} className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                      {blockLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                      {t('blockUser')}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Link confirmation modal */}
        <AnimatePresence>
          {showLinkModal && pendingLink && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
                onClick={() => { setShowLinkModal(false); setPendingLink(null); }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[201]"
              >
                <div className="bg-surface-secondary border border-border rounded-2xl shadow-2xl p-6 mx-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <ExternalLink size={20} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white">{t('openLink')}</h3>
                      <p className="text-sm text-zinc-400 mt-0.5">{t('linkWarning')}</p>
                    </div>
                  </div>
                  <div className="bg-black/20 rounded-xl p-3 mb-4 border border-white/5">
                    <p className="text-xs text-zinc-400 mb-1 font-medium">{t('link')}:</p>
                    <p className="text-sm text-vortex-400 break-all">{pendingLink}</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setShowLinkModal(false); setPendingLink(null); }} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all text-sm font-medium">{t('cancel')}</button>
                    <button onClick={() => { if (pendingLink) window.open(pendingLink, '_blank', 'noopener,noreferrer'); setShowLinkModal(false); setPendingLink(null); }} className="flex-1 px-4 py-2.5 rounded-xl bg-vortex-500 hover:bg-vortex-600 text-white transition-all text-sm font-medium flex items-center justify-center gap-2">
                      <ExternalLink size={16} />
                      {t('open')}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Copy notification */}
        <AnimatePresence>
          {showCopyNotification && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] pointer-events-none"
            >
              <div className="bg-surface-secondary/95 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-3 shadow-2xl">
                <p className="text-sm font-medium text-white">Скопировано!</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Desktop
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60]"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 35, stiffness: 400, mass: 0.8 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-3xl max-h-[90vh] shadow-2xl border md:border-border/50 overflow-hidden flex flex-col"
        style={{ backgroundColor: '#18181b' }}
      >
        {/* Шапка */}
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h2 className="text-lg font-bold text-white">
            {isSelf ? t('myProfile') : t('profileTitle')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        {profileContent}
      </motion.div>

      {/* Media lightbox gallery */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <ImageLightbox
            images={sharedMedia.flatMap((msg) => (msg.media || []).map((m) => ({ url: m.url, type: m.type })))}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </AnimatePresence>

      {/* Block confirmation modal */}
      <AnimatePresence>
        {showBlockModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
              onClick={() => setShowBlockModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[101]"
            >
              <div className="bg-surface-secondary border border-border rounded-2xl shadow-2xl p-6 mx-4">
                <h3 className="text-lg font-semibold text-white mb-4">{t('blockUserConfirm')}</h3>
                {chatId && (
                  <label className="flex items-start gap-3 mb-6 cursor-pointer group p-3 rounded-xl hover:bg-white/5 transition-colors">
                    <div className="relative flex items-center justify-center mt-0.5">
                      <input
                        type="checkbox"
                        checked={deleteChat}
                        onChange={(e) => setDeleteChat(e.target.checked)}
                        className="peer w-5 h-5 rounded-md border-2 border-zinc-600 bg-transparent appearance-none cursor-pointer transition-all checked:bg-accent checked:border-accent"
                      />
                      <Check size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors block">{t('alsoDeleteChat')}</span>
                      <span className="text-xs text-zinc-500 mt-1 block">{t('chatHistoryWillBeDeleted')}</span>
                    </div>
                  </label>
                )}
                <div className="flex gap-3">
                  <button onClick={() => { setShowBlockModal(false); setDeleteChat(false); }} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all text-sm font-medium">{t('cancel')}</button>
                  <button onClick={handleBlockUser} disabled={blockLoading} className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                    {blockLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                    {t('blockUser')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Link confirmation modal */}
      <AnimatePresence>
        {showLinkModal && pendingLink && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
              onClick={() => { setShowLinkModal(false); setPendingLink(null); }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[201]"
            >
              <div className="bg-surface-secondary border border-border rounded-2xl shadow-2xl p-6 mx-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <ExternalLink size={20} className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white">{t('openLink')}</h3>
                    <p className="text-sm text-zinc-400 mt-0.5">{t('linkWarning')}</p>
                  </div>
                </div>
                <div className="bg-black/20 rounded-xl p-3 mb-4 border border-white/5">
                  <p className="text-xs text-zinc-400 mb-1 font-medium">{t('link')}:</p>
                  <p className="text-sm text-vortex-400 break-all">{pendingLink}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => { setShowLinkModal(false); setPendingLink(null); }} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all text-sm font-medium">{t('cancel')}</button>
                  <button onClick={() => { if (pendingLink) window.open(pendingLink, '_blank', 'noopener,noreferrer'); setShowLinkModal(false); setPendingLink(null); }} className="flex-1 px-4 py-2.5 rounded-xl bg-vortex-500 hover:bg-vortex-600 text-white transition-all text-sm font-medium flex items-center justify-center gap-2">
                    <ExternalLink size={16} />
                    {t('open')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Copy notification */}
      <AnimatePresence>
        {showCopyNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] pointer-events-none"
          >
            <div className="bg-surface-secondary/95 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-3 shadow-2xl">
              <p className="text-sm font-medium text-white">Скопировано!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
