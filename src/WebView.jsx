import { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';

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
  allowExternalScripts = false, // Для React файлов нужна загрузка внешних скриптов
  ...props 
}) {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(startInLoadingState);

  useEffect(() => {
    if (!containerRef.current) {
      console.log('WebView: containerRef.current is null, waiting...');
      return;
    }
    if (!source || (!source.html && !source.uri)) {
      console.warn('WebView: source is missing or invalid', source);
      return;
    }

    const container = containerRef.current;
    console.log('WebView: useEffect triggered', { 
      hasHtml: !!source.html, 
      hasUri: !!source.uri,
      htmlLength: source.html?.length,
      allowExternalScripts 
    });
    
    // Очищаем контейнер
    container.innerHTML = '';
    setLoading(startInLoadingState);

    // Создаем iframe
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.backgroundColor = '#ffffff';
    iframe.style.display = 'block';
    iframe.style.overflow = 'auto';
    iframe.setAttribute('scrolling', 'yes');
    
    // Настройка sandbox в зависимости от типа контента
    // Для обычных HTML файлов НЕ используем sandbox - это позволяет им работать без ограничений
    // Для React/React Native файлов используем sandbox с разрешениями для внешних скриптов
    if (source.html && allowExternalScripts) {
      // Для React/React Native файлов нужна загрузка внешних скриптов (CDN)
      // Устанавливаем sandbox атрибут как строку
      const sandboxValues = [];
      if (javaScriptEnabled) {
        sandboxValues.push('allow-scripts');
      }
      sandboxValues.push('allow-same-origin'); // Нужен для загрузки внешних скриптов
      sandboxValues.push('allow-forms');
      sandboxValues.push('allow-popups');
      sandboxValues.push('allow-modals');
      iframe.setAttribute('sandbox', sandboxValues.join(' '));
      console.log('WebView: Using sandbox with external scripts support:', sandboxValues.join(' '));
    } else {
      // Для обычных HTML файлов НЕ устанавливаем sandbox вообще
      // Это позволяет HTML работать полностью без ограничений
      console.log('WebView: No sandbox (plain HTML mode - full access)');
      // Явно удаляем sandbox, если он был установлен ранее
      iframe.removeAttribute('sandbox');
    }
    
    // Обработчики событий
    const handleLoad = () => {
      console.log('WebView iframe: load event fired - iframe загружен!');
      console.log('WebView: iframe readyState:', iframe.contentDocument?.readyState || 'N/A');
      setLoading(false);
      
      // Проверяем, действительно ли контент загружен
      setTimeout(() => {
        try {
          if (iframe.contentDocument?.body) {
            const hasContent = iframe.contentDocument.body.innerHTML.trim().length > 0;
            console.log('WebView: Контент в iframe:', hasContent ? 'ЕСТЬ' : 'ОТСУТСТВУЕТ');
            if (hasContent) {
              console.log('WebView: Размер контента:', iframe.contentDocument.body.innerHTML.length, 'символов');
            }
          }
        } catch (e) {
          console.log('WebView: Не удалось проверить контент (нормально для sandboxed iframe)');
        }
      }, 100);
      
      if (onLoad) {
        onLoad({ nativeEvent: {} });
      }
      if (onLoadEnd) {
        onLoadEnd({ nativeEvent: {} });
      }
    };

    const handleError = (error) => {
      setLoading(false);
      console.error('WebView iframe error:', error);
      if (onError) {
        onError({ nativeEvent: { error: error.message || 'Unknown error' } });
      }
    };

    // Добавляем обработчики событий
    iframe.addEventListener('load', handleLoad, { once: true });
    iframe.addEventListener('error', handleError, { once: true });

    // Сообщения из iframe -> родитель
    const handleMessage = (event) => {
      try {
        // Фильтруем только сообщения от текущего iframe
        if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
          return;
        }
        if (onMessage) {
          onMessage({ nativeEvent: { data: event.data } });
        }
      } catch (e) {
        // Ничего не делаем
      }
    };
    if (onMessage) {
      window.addEventListener('message', handleMessage);
    }

    // Добавляем iframe в DOM сначала (пустой)
    container.appendChild(iframe);
    iframeRef.current = iframe;
    console.log('WebView: iframe added to DOM');

    // Устанавливаем контент после добавления в DOM
    // Используем requestAnimationFrame для гарантии, что iframe готов
    requestAnimationFrame(() => {
      if (source.html) {
        console.log('WebView: Setting HTML content, length:', source.html.length);
        console.log('WebView: First 200 chars:', source.html.substring(0, 200));
        
        // Используем data URI вместо srcDoc для большей совместимости
        // srcDoc может не работать в некоторых случаях, особенно с большими HTML документами
        try {
          // Создаем data URI с правильной кодировкой
          const htmlContent = source.html;
          const dataUri = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
          
          console.log('WebView: Создан data URI, длина HTML:', htmlContent.length);
          console.log('WebView: Длина data URI:', dataUri.length);
          
          // Проверяем размер - если слишком большой, используем blob URL
          if (dataUri.length > 2 * 1024 * 1024) { // Больше 2MB
            console.log('WebView: HTML слишком большой для data URI, используем Blob URL');
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            iframe.src = blobUrl;
            console.log('WebView: Использован Blob URL');
          } else {
            iframe.src = dataUri;
            console.log('WebView: Использован data URI');
          }
          
          // Проверяем через небольшой таймаут, загрузился ли iframe
          setTimeout(() => {
            if (iframe.contentWindow) {
              console.log('WebView: iframe contentWindow доступен');
              // Проверяем, есть ли контент в iframe
              try {
                if (iframe.contentDocument) {
                  const body = iframe.contentDocument.body;
                  if (body) {
                    console.log('WebView: iframe body найден, innerHTML length:', body.innerHTML?.length || 0);
                    console.log('WebView: iframe body has content:', body.innerHTML?.length > 0 ? 'YES' : 'NO');
                  } else {
                    console.warn('WebView: iframe body не найден');
                  }
                } else {
                  console.log('WebView: contentDocument недоступен (нормально для sandboxed iframe)');
                }
              } catch (e) {
                console.log('WebView: Не удалось проверить contentDocument (нормально для sandboxed iframe):', e.message);
              }
            } else {
              console.warn('WebView: iframe contentWindow недоступен');
            }
          }, 500);
        } catch (error) {
          console.error('WebView: Ошибка при установке контента:', error);
          // Фоллбэк на srcDoc
          try {
            iframe.srcDoc = source.html;
            console.log('WebView: Использован srcDoc как fallback');
          } catch (srcDocError) {
            console.error('WebView: Ошибка при использовании srcDoc:', srcDocError);
          }
        }
      } else if (source.uri) {
        console.log('WebView: Setting URI:', source.uri);
        iframe.src = source.uri;
        // Для внешних URI используем sandbox
        const sandboxValues = [];
        if (javaScriptEnabled) {
          sandboxValues.push('allow-scripts');
        }
        sandboxValues.push('allow-forms');
        sandboxValues.push('allow-popups');
        sandboxValues.push('allow-modals');
        if (sandboxValues.length > 0) {
          iframe.setAttribute('sandbox', sandboxValues.join(' '));
        }
      }
    });

    return () => {
      console.log('WebView: cleanup');
      if (container) {
        container.innerHTML = '';
      }
      if (iframeRef.current) {
        iframeRef.current.removeEventListener('load', handleLoad);
        iframeRef.current.removeEventListener('error', handleError);
      }
      if (onMessage) {
        window.removeEventListener('message', handleMessage);
      }
    };
  }, [source, javaScriptEnabled, startInLoadingState, allowExternalScripts, onMessage]);

  // Отправка сообщений В iframe (без пересоздания iframe)
  useEffect(() => {
    if (!outgoingMessage) return;
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(outgoingMessage, '*');
    } catch (e) {
      // ignore
    }
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
