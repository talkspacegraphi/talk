import { Component, type ReactNode } from 'react';
import { captureException } from '../lib/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  reloadCount: number;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    // Сохраняем счётчик перезагрузок в sessionStorage чтобы не сбрасывался при reload
    const reloadCount = parseInt(sessionStorage.getItem('eb_reload_count') || '0', 10);
    this.state = { hasError: false, error: null, reloadCount };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    captureException(error, { componentStack: errorInfo.componentStack });
  }

  handleReload = () => {
    const newCount = this.state.reloadCount + 1;
    sessionStorage.setItem('eb_reload_count', String(newCount));
    this.setState({ hasError: false, error: null, reloadCount: newCount });
    window.location.reload();
  };

  handleReset = () => {
    // Полный сброс — очищаем кэш и перезагружаем
    sessionStorage.removeItem('eb_reload_count');
    sessionStorage.clear();
    localStorage.removeItem('vortex_token');
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.error?.message?.includes('Failed to fetch dynamically imported module')
        || this.state.error?.message?.includes('Loading chunk');

      // Если это ошибка загрузки чанка — одна перезагрузка может помочь (плохая сеть)
      // Но не более 2 раз — иначе бесконечный цикл
      if (isChunkError && this.state.reloadCount < 2) {
        // Авто-перезагрузка с задержкой только для chunk ошибок
        setTimeout(() => this.handleReload(), 1500);
        return (
          <div className="h-full flex items-center justify-center bg-surface p-8">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <span className="text-3xl">↻</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Загрузка...</h2>
              <p className="text-sm text-zinc-400">Повторное подключение</p>
            </div>
          </div>
        );
      }

      // После 2 попыток или для других ошибок — показываем экран с кнопками
      return this.props.fallback || (
        <div className="h-full flex items-center justify-center bg-surface p-8">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <span className="text-3xl">!</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Что-то пошло не так</h2>
            <p className="text-sm text-zinc-400 mb-6">
              {this.state.error?.message || 'Произошла неожиданная ошибка'}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-xl bg-vortex-500 hover:bg-vortex-600 text-white text-sm font-medium transition-colors"
              >
                Перезагрузить
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
              >
                Сбросить и войти заново
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Сбрасываем счётчик если приложение загрузилось успешно
    if (this.state.reloadCount > 0) {
      sessionStorage.removeItem('eb_reload_count');
    }

    return this.props.children;
  }
}
