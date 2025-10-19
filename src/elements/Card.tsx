import { h } from 'preact';
import { ElementBase } from './ElementBase';
import { ElementData } from '../types';

export class Card extends ElementBase {
  static kind = 'card';
  static render(d: ElementData){
    return <div className="element" style={{left:d.x, top:d.y, width:d.w, height:d.h, borderRadius:12, padding:12, boxShadow:'0 8px 30px rgba(2,6,23,0.6)', background:'#07122a'}}>
      <h4 style={{margin:0}}>{d.props?.title || 'Card'}</h4>
      <p style={{marginTop:6}}>{d.props?.body || 'Card body'}</p>
    </div>;
  }
}
