import { h } from 'preact';
import { ElementBase } from './ElementBase';
import { ElementData } from '../types';

export class Text extends ElementBase {
  static kind = 'text';
  static render(d: ElementData){
    return <p className="element" style={{left:d.x, top:d.y}}>{d.props?.text || 'Text block'}</p>;
  }
}
