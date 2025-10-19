import { h } from 'preact';
import { ElementBase } from './ElementBase';
import { ElementData } from '../types';

export class Div extends ElementBase {
  static kind = 'div';
  static render(d: ElementData){
    return <div className="element" style={{left:d.x, top:d.y, width:d.w, height:d.h, border:'1px dashed rgba(255,255,255,0.06)', padding:8}}>{d.props?.text || 'div'}</div>;
  }
}
