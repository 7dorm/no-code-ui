import {BaseBlock} from "./BaseBlock.tsx";
import {type ComponentChildren, createRef} from "preact";

export class FrameBlock extends BaseBlock {
    children = createRef();
    static displayName = "FrameBlock";

    constructor(props: any) {
        super(props);
        this.children.current = props.children;
    }

    renderBlock(): ComponentChildren {
        console.log(this.children.current);
        return (<div
        style={
            {
                width: 600,
                height: 500,
                backgroundColor: "#222",
            }
        }>
            {this.children.current.map((child: any) => {
                child.type.prototype.renderBlock()
            })}
        </div>);
    }
}
