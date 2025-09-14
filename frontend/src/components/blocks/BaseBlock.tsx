import {Component} from "preact";
import type {ComponentProps, Context, ComponentChildren} from "preact";

// @ts-ignore
enum CursorState {
    Grab = "grab",
    Grabbing = "grabbing",
    Pointer = "pointer",
    RowResize = "row-resize",
    ColResize = "col-resize",
}


export abstract class BaseBlock extends Component {
    protected constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
    }

    state = {
        dragging: false,
        position: [0, 0],
        offset: [0, 0],
        width: 500,
        height: 300,
        cursor: CursorState.Grab,
        over: false,
        resize: false,
        pos_from: [0, 0],
        selected: false
    };

    renderBlock(): ComponentChildren {
        return "";
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
        this.select()
        if ((e.offsetY < 10 && e.offsetY > 0) || (e.offsetY > this.state.height - 10 && e.offsetY < this.state.height)) {
            this.setState({cursorState: CursorState.RowResize});
            return;
        }
        if ((e.offsetX < 10 && e.offsetX > 0) || (e.offsetX > this.state.width - 10 && e.offsetX < this.state.width)) {
            this.setState({cursorState: CursorState.ColResize});
            return;
        }

        let my = e.clientY;
        let mx = e.clientX;

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
        let my = e.clientY;
        let mx = e.clientX;
        let posx = mx - this.state.offset[0];
        let posy = my - this.state.offset[1];

        if (this.state.resize) {
            let width = this.state.width;
            let height = this.state.height;

            let diffx = mx - this.state.width - this.state.position[0];
            let diffy = my - this.state.height - this.state.position[1];
            console.log(diffx, diffy);


            if (this.state.pos_from[0] == 0){
                diffx = 0;
            }
            if (this.state.pos_from[1] == 0){
                diffy = 0;
            }

            let pos = this.state.position;
            if (diffx < -this.state.width + 50) {
                diffx += this.state.width;
                pos[0] += diffx;
                width -= diffx;
            } else {
                width += diffx;
            }
            if (diffy < -this.state.height + 50) {
                diffy += this.state.height;
                pos[1] += diffy;
                height -= diffy;
            } else {
                height += diffy;
            }


            this.setState({
                width: width,
                height: height,
                position: pos
            });
        }

        if (!this.state.dragging) return;
        this.setState({
            dragging: true,
            position: [posx, posy]
        });
    };

    onMouseUp = () => {
        this.setState({dragging: false, resize: false});
        let [x, y] = this.state.position;
        let [w, h] = [this.state.width, this.state.height];
        this.setState({
            position: [Math.round(x / 30) * 30, Math.round(y / 30) * 30],
            width: Math.round(w / 30) * 30,
            height: Math.round(h / 30) * 30,
        });
    };

    onMouseOver = (e: MouseEvent) => {
        this.setState({over: true});
    };

    onMouseLeave = (e: MouseEvent) => {
        this.setState({over: false});
    }

    onResizeMouseDown = (e: MouseEvent) => {
        let [offsetX, offsetY] = [e.clientX - this.state.position[0], e.clientY - this.state.position[1]];
        let pos_from = [0, 0];
        if (offsetX < this.state.width / 4) {
            pos_from[0] = -1;
        } else if (offsetX > this.state.width / 4 && offsetX < 3 * this.state.width / 4) {
            pos_from[0] = 0;
        } else {
            pos_from[0] = 1;
        }
        if (offsetY < this.state.height / 4) {
            pos_from[1] = -1;
        } else if (offsetY > this.state.height / 4 && offsetY < 3 * this.state.height / 4) {
            pos_from[1] = 0;
        } else {
            pos_from[1] = 1;
        }
        this.setState({
            resize: true,
            pos_from: pos_from,
        })
    }

    deselect = () => {
        this.setState({selected: false});
    }

    select = () => {
        this.setState({selected: true});
    }

    render() {
        return (
            <>
                <div
                    className="block glass-element"
                    style={{
                        cursor: this.state.cursor,
                        width: this.state.width,
                        height: this.state.height,
                        top: this.state.position[1],
                        left: this.state.position[0],
                    }}
                    onMouseDown={this.onMouseDown}>
                    {this.renderBlock()}
                </div>
                {this.state.selected && (
                    <>
                        <h1
                            style={{
                                position: 'absolute',
                                zIndex: 999,
                                top: this.state.position[1] - 35,
                                left: this.state.position[0] - 10,
                            }}
                            onMouseDown={this.onResizeMouseDown}
                        >
                            *
                        </h1>
                        <h1
                            style={{
                                position: 'absolute',
                                zIndex: 999,
                                top: this.state.position[1] + this.state.height / 2 - 35,
                                left: this.state.position[0] - 10,
                            }}
                            onMouseDown={this.onResizeMouseDown}
                        >
                            *
                        </h1>
                        <h1
                            style={{
                                position: 'absolute',
                                zIndex: 999,
                                top: this.state.position[1] + this.state.height - 35,
                                left: this.state.position[0] - 10,
                            }}
                            onMouseDown={this.onResizeMouseDown}
                        >
                            *
                        </h1>

                        <h1
                            style={{
                                position: 'absolute',
                                zIndex: 999,
                                top: this.state.position[1] - 35,
                                left: this.state.position[0] + this.state.width / 2 - 10,
                            }}
                            onMouseDown={this.onResizeMouseDown}
                        >
                            *
                        </h1>
                        <h1
                            style={{
                                position: 'absolute',
                                zIndex: 999,
                                top: this.state.position[1] + this.state.height - 35,
                                left: this.state.position[0] + this.state.width / 2 - 10,
                            }}
                            onMouseDown={this.onResizeMouseDown}
                        >
                            *
                        </h1>

                        <h1
                            style={{
                                position: 'absolute',
                                zIndex: 999,
                                top: this.state.position[1] - 35,
                                left: this.state.position[0] + this.state.width - 10,
                            }}
                            onMouseDown={this.onResizeMouseDown}
                        >
                            *
                        </h1>
                        <h1
                            style={{
                                position: 'absolute',
                                zIndex: 999,
                                top: this.state.position[1] + this.state.height / 2 - 35,
                                left: this.state.position[0] + this.state.width - 10,
                            }}
                            onMouseDown={this.onResizeMouseDown}
                        >
                            *
                        </h1>
                        <h1
                            style={{
                                position: 'absolute',
                                zIndex: 999,
                                top: this.state.position[1] + this.state.height - 35,
                                left: this.state.position[0] + this.state.width - 10,
                            }}
                            onMouseDown={this.onResizeMouseDown}
                        >
                            *
                        </h1>
                    </>
                )}

            </>
        )
    }
}
