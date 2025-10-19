import { h } from 'preact';
import { ElementBase } from './ElementBase';
import { ElementData } from '../types';

export class Box extends ElementBase {
  static kind = 'box';
  static render(d: ElementData){
    return <div className="element" style={{left:d.x, top:d.y, width:d.w, height:d.h, background:'linear-gradient(180deg,rgba(96,165,250,0.12), rgba(96,165,250,0.04))', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center'}}>{d.props?.children || 'Box'}</div>;
  }
}
