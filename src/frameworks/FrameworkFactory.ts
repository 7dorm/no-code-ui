/**
 * Фабрика для создания экземпляров Framework по типу файла
 */
import { HtmlFramework } from './HtmlFramework';
import { ReactFramework } from './ReactFramework';
import { ReactNativeFramework } from './ReactNativeFramework';

/**
 * Создает экземпляр Framework для указанного типа файла
 * @param {string} fileType - тип файла ('html', 'react', 'react-native')
 * @param {string} filePath - путь к файлу
 * @returns {HtmlFramework|ReactFramework|ReactNativeFramework} экземпляр Framework
 */
export function createFramework(fileType:string, filePath:string) {
  switch (fileType) {
    case 'html':
      return new HtmlFramework(filePath);
    case 'react':
      return new ReactFramework(filePath);
    case 'react-native':
      return new ReactNativeFramework(filePath);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Проверяет, поддерживается ли тип файла
 * @param {string} fileType - тип файла
 * @returns {boolean}
 */
export function isFrameworkSupported(fileType:string) {
  return ['html', 'react', 'react-native'].includes(fileType);
}

