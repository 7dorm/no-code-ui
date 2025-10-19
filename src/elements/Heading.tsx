import { h } from 'preact';
import { ElementBase } from './ElementBase';
import { ElementData } from '../types';

function makeHeading(level:number, d:ElementData){
  const Tag = ('h'+level) as any;
  return <Tag className="element" style={{left:d.x, top:d.y}}>{d.props?.text || Tag}</Tag>;
}

export class H1 extends ElementBase { static kind='h1'; static render(d:ElementData){ return makeHeading(1,d);} }
export class H2 extends ElementBase { static kind='h2'; static render(d:ElementData){ return makeHeading(2,d);} }
export class H3 extends ElementBase { static kind='h3'; static render(d:ElementData){ return makeHeading(3,d);} }
export class H4 extends ElementBase { static kind='h4'; static render(d:ElementData){ return makeHeading(4,d);} }
export class H5 extends ElementBase { static kind='h5'; static render(d:ElementData){ return makeHeading(5,d);} }
export class H6 extends ElementBase { static kind='h6'; static render(d:ElementData){ return makeHeading(6,d);} }
