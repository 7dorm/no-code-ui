import {Component, createRef} from "preact";
import type {ComponentProps, Context, ComponentChildren} from "preact";
import {ResizeHandlerBlock} from "./ResizeHandlerBlock.tsx";

// @ts-ignore
enum CursorState {
    Grab = "grab",
    Grabbing = "grabbing",
}

export abstract class BaseBlock extends Component<{
    saveLayout: (state: any) => void,
}> {
    static displayName = "BaseBlock";

    position = createRef();
    size = createRef();

    constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
        this.position.current = {x: 0, y: 0};
        this.size.current = {w: 500, h: 300};
    }

    state = {
        dragging: false,
        offset: [0, 0],
        cursor: CursorState.Grab,
        over: false,
        resize: false,
        pos_from: [0, 0],
        selected: false
    };

    // @ts-ignore
    renderBlock(parent_size: {w: number, h: number}): ComponentChildren {
        return "";
    }

    componentDidMount() {
        window.addEventListener("mousemove", this.onMouseMove);
        window.addEventListener("mouseup", this.onMouseUp);
        // window.addEventListener("mouseover", this.onMouseOver);
        // window.addEventListener("mouseout", this.onMouseLeave);
    }

    componentWillUnmount() {
        window.removeEventListener("mousemove", this.onMouseMove);
        window.removeEventListener("mouseup", this.onMouseUp);
        // window.removeEventListener("mouseover", this.onMouseOver);
        // window.removeEventListener("mouseout", this.onMouseLeave);
    }

    componentDidUpdate() {
        this.props.saveLayout({
            position: this.position.current,
            size: this.size.current,
        });
    }

    onMouseDown = (e: MouseEvent) => {
        this.select()

        let posx = e.clientX - e.offsetX;
        let posy = e.clientY - e.offsetY;

        this.position.current.x = posx;
        this.position.current.y = posy;

        this.setState({
            dragging: true,
            offset: [e.offsetX, e.offsetY],
            cursor: CursorState.Grabbing
        });
    };

    onMouseMove = (e: MouseEvent) => {
        let posx = e.clientX - this.state.offset[0];
        let posy = e.clientY - this.state.offset[1];

        if (!this.state.dragging) return;

        this.position.current.x = posx;
        this.position.current.y = posy;

        this.setState({
            dragging: true
        });
    };

    onMouseUp = () => {
        this.setState({
            dragging: false
        });

        let {x, y} = this.position.current;
        let {w, h} = this.size.current;

        this.position.current = {x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10}
        this.size.current = {w: Math.round(w / 10) * 10, h: Math.round(h / 10) * 10}
    };

    deselect = () => {
        this.setState({selected: false});
    }

    select = () => {
        this.setState({selected: true});
    }

    onResize = (w: number, h: number, pos: {x: number, y:number}) => {
        this.size.current.w = w;
        this.size.current.h = h;
        this.position.current = pos;
    }

    render() {
        let resizer = []
        for (let i = -1; i < 2; i++){
            for (let j = -1; j < 2; j++){
                if (i == 0 && j == 0){
                    continue;
                }
                resizer.push(
                    <ResizeHandlerBlock
                        onResize={this.onResize}
                        pos={{x: i, y: j}}
                        parent_size={this.size.current}
                        parent_pos={this.position.current}
                    />
                )
            }
        }
        return (
            <>
                <div
                    className="block glass-element"
                    style={{
                        cursor: this.state.cursor,
                        width: this.size.current.w,
                        height: this.size.current.h,
                        top: this.position.current.y,
                        left: this.position.current.x,
                    }}
                    onMouseDown={this.onMouseDown}>
                    {this.renderBlock(this.size.current)}
                </div>
                {resizer}
            </>
        )
    }
}
