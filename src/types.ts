export type ElementKind = 'div'|'button'|'img'|'a'|'h1'|'h2'|'h3'|'h4'|'h5'|'h6'|'box'|'text'|'card';

export type ElementData = {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  w: number;
  h: number;
  props?: Record<string, any>;
};
