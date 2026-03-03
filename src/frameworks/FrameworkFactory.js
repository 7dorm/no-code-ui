/**
 * Фабрика для создания экземпляров Framework по типу файла
 */
 import { HtmlFramework } from './html';
 import { ReactFramework } from './react';
 import { ReactNativeFramework } from './react-native';

/**
 * Создает экземпляр Framework для указанного типа файла
 * @param {string} fileType - тип файла ('html', 'react', 'react-native')
 * @param {string} filePath - путь к файлу
 * @param {string} projectRoot - корень проекта (опционально)
 * @returns {Framework} экземпляр Framework
 */
export function createFramework(fileType, filePath, projectRoot = null) {
  switch (fileType) {
    case 'html':
      return new HtmlFramework(filePath);
    case 'react':
      return new ReactFramework(filePath, projectRoot);
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
export function isFrameworkSupported(fileType) {
  return ['html', 'react', 'react-native'].includes(fileType);
}

