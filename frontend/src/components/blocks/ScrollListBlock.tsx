import type {JSX} from "preact";

function ScrollListBlock(props: any): JSX.Element {
    return (
        <div style={{height: '300px', overflowY: 'scroll', border: '1px solid #ccc'}}>
            {props.items.map((item: any, index: number) => (
                <div key={index} style={{padding: '10px', borderBottom: '1px dashed #eee'}}>
                    {item}
                </div>
            ))}
        </div>
    )
}

export default ScrollListBlock;
