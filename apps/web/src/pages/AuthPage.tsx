import { useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { useLang } from '../lib/i18n';
import { Eye, EyeOff, ArrowRight, UserPlus, LogIn } from 'lucide-react';
import ToastContainer from '../components/ToastContainer';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [bio, setBio] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, register } = useAuthStore();
  const { showToast } = useToastStore();
  const { t } = useLang();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSubmitting(true);

    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await register(username, displayName || username, password, bio);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка';
      showToast(errorMessage, 'error');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
  };

  return (
    <>
      <ToastContainer />
      {/* Desktop: centered card. Mobile: full screen, no frame */}
      <div className="h-full flex flex-col md:flex-row relative overflow-hidden bg-surface">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] opacity-15">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-vortex-600/40 to-purple-600/40 blur-[120px]" />
          </div>
        </div>

        {/* Mobile: full-screen form */}
        <div className="md:hidden flex-1 flex flex-col relative z-10 px-6 pt-12 pb-8 overflow-y-auto">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img src="/logo.png" alt="Talk" className="w-16 h-16 rounded-2xl shadow-lg object-cover" />
            <h1 className="text-2xl font-bold gradient-text mt-3">Talk</h1>
            <p className="text-zinc-500 text-sm mt-1">{t('modernMessengerShort')}</p>
          </div>

          {/* Tab toggler */}
          <div className="flex rounded-xl bg-white/5 p-1 mb-6">
            <button
              onClick={() => { setIsLogin(true); setPassword(''); }}
              className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                isLogin ? 'bg-gradient-to-r from-vortex-500 to-purple-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LogIn size={16} />
              {t('login')}
            </button>
            <button
              onClick={() => { setIsLogin(false); setPassword(''); }}
              className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                !isLogin ? 'bg-gradient-to-r from-vortex-500 to-purple-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <UserPlus size={16} />
              {t('register')}
            </button>
          </div>

          {/* Form — no card wrapper */}
          <form onSubmit={handleSubmit} className="space-y-4 flex-1" autoComplete="off">
            <div>
              <label htmlFor="auth-username-m" className="block text-sm font-medium text-zinc-400 mb-1.5">
                Username {!isLogin && <span className="text-zinc-600">{t('latinOnly')}</span>}
              </label>
              <input
                id="auth-username-m"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="username"
                className="w-full px-4 py-3.5 rounded-xl bg-white/[0.07] border border-white/10 text-white placeholder-zinc-600 focus:border-vortex-500/50 focus:ring-1 focus:ring-vortex-500/25 transition-all text-base"
                required
                autoComplete="off"
              />
            </div>

            {!isLogin && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">{t('displayNameLabel')}</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('displayNamePlaceholder')}
                  className="w-full px-4 py-3.5 rounded-xl bg-white/[0.07] border border-white/10 text-white placeholder-zinc-600 focus:border-vortex-500/50 focus:ring-1 focus:ring-vortex-500/25 transition-all text-base"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-password-m" className="block text-sm font-medium text-zinc-400 mb-1.5">{t('password')}</label>
              <div className="relative">
                <input
                  id="auth-password-m"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('passwordPlaceholder')}
                  className="w-full px-4 py-3.5 rounded-xl bg-white/[0.07] border border-white/10 text-white placeholder-zinc-600 focus:border-vortex-500/50 focus:ring-1 focus:ring-vortex-500/25 transition-all text-base pr-12"
                  required
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium text-zinc-400 mb-1.5">{t('aboutMe')}</label>
                <input
                  type="text"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('bioPlaceholder')}
                  className="w-full px-4 py-3.5 rounded-xl bg-white/[0.07] border border-white/10 text-white placeholder-zinc-600 focus:border-vortex-500/50 focus:ring-1 focus:ring-vortex-500/25 transition-all text-base"
                />
              </div>
            )}

            <div className="pt-2">
              <button
                disabled={isSubmitting}
                type="submit"
                className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-vortex-500 to-purple-600 text-white font-bold text-base shadow-lg shadow-vortex-500/25 hover:brightness-110 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {isLogin ? t('loginBtn') : t('createAccount')}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Desktop: split layout */}
        <div className="hidden md:flex flex-1 items-center justify-center relative z-10">
          <div className="w-full max-w-md mx-4">
            <div className="glass-strong rounded-3xl p-8 shadow-2xl">
              {/* Logo */}
              <div className="flex flex-col items-center mb-8">
                <img src="/logo.png" alt="Talk" className="w-20 h-20 rounded-2xl shadow-lg object-cover" />
                <h1 className="text-2xl font-bold gradient-text mt-4">Talk</h1>
                <p className="text-zinc-500 text-sm mt-1">{t('modernMessengerShort')}</p>
              </div>

              {/* Tab toggler */}
              <div className="flex rounded-xl bg-white/5 p-1 mb-6">
                <button
                  onClick={() => { setIsLogin(true); setPassword(''); }}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                    isLogin ? 'bg-gradient-to-r from-vortex-500 to-purple-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <LogIn size={16} />
                  {t('login')}
                </button>
                <button
                  onClick={() => { setIsLogin(false); setPassword(''); }}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                    !isLogin ? 'bg-gradient-to-r from-vortex-500 to-purple-600 text-white shadow-lg' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <UserPlus size={16} />
                  {t('register')}
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                <div>
                  <label htmlFor="auth-username-d" className="block text-sm font-medium text-zinc-400 mb-1.5">
                    Username {!isLogin && <span className="text-zinc-600">{t('latinOnly')}</span>}
                  </label>
                  <input
                    id="auth-username-d"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    placeholder="username"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:border-vortex-500/50 focus:ring-1 focus:ring-vortex-500/25 transition-all"
                    required
                    autoComplete="off"
                  />
                </div>

                {!isLogin && (
                  <div className="animate-fade-in">
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">{t('displayNameLabel')}</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t('displayNamePlaceholder')}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:border-vortex-500/50 focus:ring-1 focus:ring-vortex-500/25 transition-all"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="auth-password-d" className="block text-sm font-medium text-zinc-400 mb-1.5">{t('password')}</label>
                  <div className="relative">
                    <input
                      id="auth-password-d"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('passwordPlaceholder')}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:border-vortex-500/50 focus:ring-1 focus:ring-vortex-500/25 transition-all pr-12"
                      required
                      autoComplete={isLogin ? 'current-password' : 'new-password'}
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {!isLogin && (
                  <div className="animate-fade-in">
                    <label className="block text-sm font-medium text-zinc-400 mb-1.5">{t('aboutMe')}</label>
                    <input
                      type="text"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={t('bioPlaceholder')}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:border-vortex-500/50 focus:ring-1 focus:ring-vortex-500/25 transition-all"
                    />
                  </div>
                )}

                <button
                  disabled={isSubmitting}
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-vortex-500 to-purple-600 text-white font-medium shadow-lg hover:brightness-110 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {isLogin ? t('loginBtn') : t('createAccount')}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
