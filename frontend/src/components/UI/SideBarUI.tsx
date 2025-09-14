import {BaseUI} from "./BaseUI";
import type {ComponentChild, ComponentProps, Context, RenderableProps} from "preact";
// import ScrollListBlock from "../blocks/ScrollListBlock.tsx";
import "../../styles/components/UI/SideBarUIStyle.css";

enum CursorState {
    Grab = "grab",
    Grabbing = "grabbing",
    Pointer = "pointer",
    RowResize = "row-resize",
    ColResize = "col-resize",
}

export class SideBarUI extends BaseUI {
    objects: Array<any>;
    state = {
        dragging: false,
        position: [0, 0],
        offset: [0, 0],
        width: 500,
        height: 300,
        cursor: CursorState.Grab,
        over: false,
    };

    constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
        this.objects = [<p>Hello</p>, <p>How</p>, <p>Is</p>, <p>Your</p>, <p>Day?</p>];
    }

    componentDidMount() {
        window.addEventListener("mousemove", this.onMouseMove);
        window.addEventListener("mouseup", this.onMouseUp);
        window.addEventListener("mouseover", this.onMouseOver);
        window.addEventListener("mouseout", this.onMouseLeave);
    }

    componentWillUnmount() {
        window.removeEventListener("mousemove", this.onMouseMove);
        window.removeEventListener("mouseup", this.onMouseUp);
        window.removeEventListener("mouseover", this.onMouseOver);
        window.removeEventListener("mouseout", this.onMouseLeave);
    }

    onMouseDown = (e: MouseEvent) => {
        if ((e.offsetY < 10 && e.offsetY > 0) || (e.offsetY > this.state.height-10 && e.offsetY < this.state.height)) {
            this.setState({cursorState: CursorState.RowResize});
            return;
        }
        if ((e.offsetX < 10 && e.offsetX > 0) || (e.offsetX > this.state.width-10 && e.offsetX < this.state.width)) {
            this.setState({cursorState: CursorState.ColResize});
            return;
        }

        let my = e.clientY;
        let mx = e.clientX;
        let y = this.state.position[1];
        let x = this.state.position[0];
        let posx = mx - e.offsetX;
        let posy = my - e.offsetY;
        this.setState({
            dragging: true,
            position: [posx, posy],
            offset: [e.offsetX, e.offsetY],
            cursor: CursorState.Grabbing
        });
    };

    onMouseMove = (e: MouseEvent) => {
        if (!this.state.over) return;
        if ((e.offsetY < 20 && e.offsetY >= 0) || (e.offsetY > this.state.height-21 && e.offsetY <= this.state.height)) {
            this.setState({cursorState: CursorState.RowResize});
        }
        else if ((e.offsetX < 20 && e.offsetX >= 0) || (e.offsetX > this.state.width-21 && e.offsetX <= this.state.width)) {
            this.setState({cursorState: CursorState.ColResize});

        } else {
            this.setState({cursorState: CursorState.Grab});
        }
        if (!this.state.dragging) return;
        let my = e.clientY;
        let mx = e.clientX;
        let posx = mx - this.state.offset[0];
        let posy = my - this.state.offset[1];
        this.setState({
            dragging: true,
            position: [posx, posy]
        });
    };

    onMouseUp = () => {
        this.setState({dragging: false});
        let [x, y] = this.state.position;
        this.setState({
            position: [Math.round(x / 30) * 30, Math.round(y / 30) * 30],
        });
    };

    onMouseOver = (e: MouseEvent) => {
        this.setState({over: true});
        console.log('Over');
    };

    onMouseLeave = (e: MouseEvent) => {
        this.setState({over: false});
        console.log('Leave');
    }

    render(props?: RenderableProps<any>, state?: Readonly<any>, context?: any): ComponentChild {
        return (
            <>
                <div
                    className={`side-bar glass-element ${this.state.dragging ? "dragging" : ""}`}
                    style={{
                        cursor: this.state.cursor,
                        width: this.state.width,
                        height: this.state.height,
                        top: this.state.position[1],
                        left: this.state.position[0],
                    }}
                    onMouseDown={this.onMouseDown}
                >
                    {/*<ScrollListBlock items = {this.objects}/>*/}
                </div>
            </>);
    }
}
