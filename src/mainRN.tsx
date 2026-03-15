if (typeof process === 'undefined') {
  window.process.env = {};
  window.process.nextTick = (fn: () => void) => setTimeout(fn, 0);
  window.process.cwd = () => '/';
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as ReactNativeWeb from 'react-native-web';
import AppRN from './AppRN';
import './index.css';

(window as any).__NO_CODE_UI_REACT_NATIVE_WEB__ = ReactNativeWeb;

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element with id "root" not found');
}

createRoot(rootElement).render(
    <StrictMode>
      <AppRN />
    </StrictMode>
);

/*

- В целом все аккуратно, но в начале семестра мы с вами сядем все перетряхнем, в том числе цели проекта.
- JS c JSDoc вам не нужен, переходите на TS не страдайте ерундой(https://github.com/7dorm/no-code-ui/blob/8a56388fedb544a8361a6f76664aea8ee2fd2b48/src/blockEditor/AstBidirectionalSync.js#L18C1-L20C4)
- Иерархия классов фреймфорков вам скорее всего не нужна, оставьте конструктры, наследования и суперклассы java разработчикам.
- Попробуйте ts-pattern (https://github.com/7dorm/no-code-ui/blob/8a56388fedb544a8361a6f76664aea8ee2fd2b48/src/blockEditor/AstBidirectionalSync.js#L135)
- Как вы умудрились сделать такой проект без стейт менеджера для меня загадка, начинайте осваивать zustand, не лишним будет заглянуть в его исходники, чтобы не было иллюзий магии (библиотека 30 LoC + типизация). Подобные вещи уйдут (https://github.com/7dorm/no-code-ui/blob/8a56388fedb544a8361a6f76664aea8ee2fd2b48/src/BlockEditorPanel.jsx#L70)

- split плохо работает, не знаю что там, используйте https://github.com/bvaughn/react-resizable-panels он хорошо работает
- панели надо перетряхнуть. Заголовок занимает много места, дерево файлов нельзя скрыть.
- с 1.0.0 вы погорячились 🙂
 */
