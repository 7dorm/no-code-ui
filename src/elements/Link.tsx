import { h } from 'preact';
import { ElementBase } from './ElementBase';
import { ElementData } from '../types';

export class LinkEl extends ElementBase {
  static kind = 'a';
  static render(d: ElementData){
    const href = d.props?.href || '#';
    return <a className="element" href={href} style={{left:d.x, top:d.y}}>{d.props?.text || href}</a>;
  }
}
