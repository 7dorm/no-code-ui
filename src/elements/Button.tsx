import { h } from 'preact';
import { ElementBase } from './ElementBase';
import { ElementData } from '../types';

export class ButtonEl extends ElementBase {
  static kind = 'button';
  static render(d: ElementData){
    return <button className="element" style={{left:d.x, top:d.y, width:Math.max(80,d.w), height:Math.max(28,d.h)}}>{d.props?.label || 'Button'}</button>;
  }
}
