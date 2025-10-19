import { h } from 'preact';
import { ElementBase } from './ElementBase';
import { ElementData } from '../types';

export class ImageEl extends ElementBase {
  static kind = 'img';
  static render(d: ElementData){
    const src = d.props?.src || 'https://via.placeholder.com/150';
    return <img className="element" src={src} style={{left:d.x, top:d.y, width:d.w, height:d.h, objectFit:'cover'}} />;
  }
}
