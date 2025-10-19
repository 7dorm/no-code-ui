import { h } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';
import { ProjectHandler } from '../project/ProjectHandler';
import { ElementData } from '../types';
import { ELEMENT_REGISTRY } from '../elements/registry';

export function Workspace(){
  const [elements, setElements] = useState<ElementData[]>([]);
  useEffect(()=> setElements(ProjectHandler.load()!.elements), []);
  useEffect(()=> ProjectHandler.subscribe(p=> setElements(p.elements)), []);

  return (
    <div style={{position:'relative',flex:1,height:'100%'}} onMouseDown={e=>{}}>
      {elements.map(el=> <RenderElement key={el.id} data={el} />)}
    </div>
  )
}

function RenderElement({data}:{data:ElementData}){
  const cls = ELEMENT_REGISTRY[data.kind];
  if(!cls) return null;
  const Comp = (cls as any).render;
  // wrap with draggable handlers
  return <Draggable data={data}>{Comp(data)}</Draggable>;
}

function Draggable({children, data}:{children:preact.JSX.Element, data:ElementData}){
  const ref = useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    const el = ref.current;
    if(!el) return;
    el.onmousedown = (ev:any)=>{
      ev.preventDefault();
      const startX = ev.clientX, startY = ev.clientY;
      const origX = data.x, origY = data.y;
      function onmove(m:any){
        const dx = m.clientX - startX;
        const dy = m.clientY - startY;
        ProjectHandler.updateElement(data.id, {x: origX + dx, y: origY + dy});
      }
      function onup(){
        document.removeEventListener('mousemove', onmove);
        document.removeEventListener('mouseup', onup);
      }
      document.addEventListener('mousemove', onmove);
      document.addEventListener('mouseup', onup);
    };
  },[data.id]);
  return <div ref={ref} style={{position:'absolute', left:data.x, top:data.y}}>{children}</div>;
}
