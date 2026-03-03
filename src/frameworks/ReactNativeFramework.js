/**
 * Реализация Framework для React Native файлов
 * Наследуется от ReactFramework, но добавляет поддержку React Native Web
 */
import { ReactFramework } from './ReactFramework';
import { toReactStyleObjectText } from '../blockEditor/styleUtils';
import { generateReactNativeHTML } from './react-native/generateHTML';

/**
 * Реализация Framework для React Native файлов
 * Использует React Native Web для рендеринга в браузере
 */
export class ReactNativeFramework extends ReactFramework {
  /**
   * Генерирует HTML для превью/редактора с поддержкой React Native Web
   * Перенесено из RenderFile.jsx: createReactNativeHTML
   */
  async generateHTML(code, filePath, options = {}) {
    return generateReactNativeHTML({
      framework: this,
      code,
      filePath,
      options,
    });
  }

  /**
   * Строит JSX сниппет для вставки нового блока (React Native)
   * Переопределяет метод из ReactFramework для поддержки React Native компонентов
   */
  buildInsertSnippet({ tag, text, stylePatch }) {
    const styleObj = stylePatch ? toReactStyleObjectText(stylePatch) : '';
    const styleAttr = styleObj ? ` style={{${styleObj}}}` : '';
    const tagName = tag || 'View';
    const body = text || 'Новый блок';
    
    if (tagName === 'Text') {
      return `<Text${styleAttr}>${body || 'Новый текст'}</Text>`;
    }
    
    // TouchableOpacity: вшиваем inline onPress, чтобы не создавать лишних обработчиков в коде
    const isButton = tagName === 'TouchableOpacity';
    const onPressAttr = isButton
      ? ` onPress={() => { try { console.log('Button pressed'); } catch(e) {} }}`
      : '';
    
    // View/TouchableOpacity: вложим Text для читаемости
    return `<${tagName}${styleAttr}${onPressAttr}><Text>${body}</Text></${tagName}>`;
  }
}

