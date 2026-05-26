import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import type { CSSProperties } from 'react';

/**
 * WebView компонент для React Native Web
 * Использует iframe под капотом для веб-платформы
 */
function WebView({ 
  source, 
  style, 
  javaScriptEnabled = true,
  domStorageEnabled = true,
  startInLoadingState = true,
  renderLoading,
  onError,
  onHttpError,
  onLoad,
  onLoadEnd,
  onMessage,
  outgoingMessage,
  selectedBlockId,
  allowExternalScripts = false, // Для React файлов нужна загрузка внешних скриптов
  ...props 
}: {
  source: { html?: string; uri?: string };
  style?: CSSProperties;
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  startInLoadingState?: boolean;
  renderLoading?: () => React.ReactNode;
  onError?: (event: { nativeEvent: { error?: string; description?: string; message?: string } }) => void;
  onHttpError?: (error: Error) => void;
  onLoad?: (event: { nativeEvent: {} }) => void;
  onLoadEnd?: () => void;
  onMessage?: (event: { nativeEvent: { data: unknown } }) => void;
  outgoingMessage?: unknown;
  selectedBlockId?: string | null;
  allowExternalScripts?: boolean;
  [key: string]: unknown;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const onMessageRef = useRef(onMessage);
  const outgoingMessageRef = useRef(outgoingMessage);
  const pendingOutgoingRef = useRef<unknown[]>([]);
  const [loading, setLoading] = useState(startInLoadingState);

  useEffect(() => {
    outgoingMessageRef.current = outgoingMessage;
  }, [outgoingMessage]);

  const postOutgoingToIframe = (message: unknown) => {
    if (!message) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      pendingOutgoingRef.current.push(message);
      return;
    }
    try {
      iframe.contentWindow.postMessage(message, '*');
    } catch (e) {
      pendingOutgoingRef.current.push(message);
    }
  };

  const flushPendingOutgoing = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || pendingOutgoingRef.current.length === 0) return;
    const queue = pendingOutgoingRef.current.slice();
    pendingOutgoingRef.current = [];
    queue.forEach((message) => {
      try {
        iframe.contentWindow?.postMessage(message, '*');
      } catch (e) {}
    });
  };

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!containerRef.current) {
      console.log('WebView: containerRef.current is null, waiting...');
      return;
    }
    if (!source || (!source.html && !source.uri)) {
      console.warn('WebView: source is missing or invalid', source);
      return;
    }

    const container = containerRef.current as HTMLElement | null;
    console.log('WebView: useEffect triggered', { 
      hasHtml: !!source.html, 
      hasUri: !!source.uri,
      htmlLength: source.html?.length,
      allowExternalScripts 
    });
    
    // Double-buffering logic to avoid white flash
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.backgroundColor = '#ffffff';
    iframe.style.overflow = 'auto';
    iframe.setAttribute('scrolling', 'yes');
    // Hide initially and position absolute so it overlays or renders silently
    iframe.style.opacity = '0';
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    
    if (source.html && allowExternalScripts) {
      const sandboxValues = [];
      if (javaScriptEnabled) sandboxValues.push('allow-scripts');
      sandboxValues.push('allow-same-origin', 'allow-forms', 'allow-popups', 'allow-modals');
      iframe.setAttribute('sandbox', sandboxValues.join(' '));
    } else {
      iframe.removeAttribute('sandbox');
    }

    // Обработчики событий
    const handleLoad = (e?: Event) => {
      try {
        if (!iframe.src || iframe.src === 'about:blank' || iframe.src === window.location.href) {
          return;
        }
      } catch (e) {}

      console.log('WebView iframe: load event fired - iframe загружен!');
      setLoading(false);
      
      // Once loaded, show the new iframe
      iframe.style.opacity = '1';
      iframe.style.position = 'relative'; 
      
      // Restore scroll position from old iframe if possible
      if (iframeRef.current && iframeRef.current.contentWindow) {
        try {
          const oldY = iframeRef.current.contentWindow.scrollY || iframeRef.current.contentDocument?.documentElement?.scrollTop || 0;
          const oldX = iframeRef.current.contentWindow.scrollX || iframeRef.current.contentDocument?.documentElement?.scrollLeft || 0;
          if (oldY > 0 || oldX > 0) {
            iframe.contentWindow?.scrollTo(oldX, oldY);
          }
        } catch (err) {}
      }

      // Remove the old iframe if it exists
      if (iframeRef.current && iframeRef.current !== iframe) {
        try {
          // just remove it from DOM
          iframeRef.current.remove();
        } catch (err) {}
      }
      iframeRef.current = iframe;

      // Resend the last outgoing message (e.g. selection state) to the new iframe
      if (iframe.contentWindow) {
        if (selectedBlockId) {
          try {
            iframe.contentWindow.postMessage({ type: 'mrpak:select', id: selectedBlockId }, '*');
          } catch (e) {}
        } else if (outgoingMessageRef.current) {
          try {
            iframe.contentWindow.postMessage(outgoingMessageRef.current, '*');
          } catch (e) {}
        }
      }

      if (onLoad) onLoad({ nativeEvent: {} });
      if (onLoadEnd) onLoadEnd();
      flushPendingOutgoing();
    };

    const handleError = (error: Event | Error) => {
      setLoading(false);
      console.error('WebView iframe error:', error);
      if (onError) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        onError({ nativeEvent: { error: errorMessage } });
      }
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    const handleMessage = (event: MessageEvent) => {
      try {
        if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
        if (onMessageRef.current) {
          onMessageRef.current({ nativeEvent: { data: event.data } });
        }
      } catch (e) {}
    };
    window.addEventListener('message', handleMessage);

    container.appendChild(iframe);

    requestAnimationFrame(() => {
      if (source.html) {
        try {
          const blob = new Blob([source.html], { type: 'text/html;charset=utf-8' });
          const blobUrl = URL.createObjectURL(blob);
          iframe.src = blobUrl;
          (iframe as any)._mrpakBlobUrl = blobUrl;
        } catch (error) {
          try {
            iframe.srcdoc = source.html;
          } catch (srcDocError) {}
        }
      } else if (source.uri) {
        iframe.src = source.uri;
        const sandboxValues = [];
        if (javaScriptEnabled) sandboxValues.push('allow-scripts');
        sandboxValues.push('allow-forms', 'allow-popups', 'allow-modals');
        if (sandboxValues.length > 0) iframe.setAttribute('sandbox', sandboxValues.join(' '));
      }
    });

    return () => {
      // Cleanup happens when component unmounts, not on every source change
      // So we don't clear container.innerHTML here anymore to allow double buffering across renders!
      // But we must clear Blob URL to avoid memory leaks.
      if ((iframe as any)._mrpakBlobUrl) {
         URL.revokeObjectURL((iframe as any)._mrpakBlobUrl);
      }
      window.removeEventListener('message', handleMessage);
    };
  }, [source, javaScriptEnabled, startInLoadingState, allowExternalScripts]);

  // Отправка сообщений В iframe (без пересоздания iframe)
  useEffect(() => {
    if (!outgoingMessage) return;
    postOutgoingToIframe(outgoingMessage);
  }, [outgoingMessage]);

  return (
    <View style={[styles.container, style]} {...props}>
      <div 
        ref={containerRef} 
        style={{
          width: '100%',
          height: '100%',
          minHeight: '600px',
          flex: 1,
          position: 'relative',
          backgroundColor: '#ffffff',
          overflow: 'auto',
        }} 
      />
      {loading && startInLoadingState && (
        <View style={styles.loadingOverlay}>
          {renderLoading ? renderLoading() : (
            <ActivityIndicator size="large" color="#667eea" />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    position: 'relative',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});


export default WebView;
