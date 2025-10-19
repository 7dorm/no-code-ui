import { h } from 'preact';
import { ElementData } from '../types';

export abstract class ElementBase {
  // each subclass should have a static kind string and static render(data)
  static kind: string;
  static render(data: ElementData): preact.JSX.Element { return <div/>; }
}
export type ElementClass = typeof ElementBase;
