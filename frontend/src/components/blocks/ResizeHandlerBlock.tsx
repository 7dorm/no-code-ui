import {Component, type Context} from "preact";


export class ResizeHandlerBlock extends Component <{
    onResize: (w: number, h: number, pos: {x: number, y: number}) => void,
    pos: { x: number, y: number },
    parent_size: { w: number, h: number },
    parent_pos: { x: number, y: number }
}> {
    state: {
        position: { x: number, y: number },
        resize: boolean
    };

    constructor(props: any, context?: Context<any>) {
        super(props, context);
        this.state = {
            position: {
                x: -10 + (1 + props.pos.x) * props.parent_size.w / 2,
                y: -35 + (1 + props.pos.y) * props.parent_size.h / 2
            },
            resize: false
        };
        this.onResizeMouseUp = this.onResizeMouseUp.bind(this);
        this.onResizeMouseMove = this.onResizeMouseMove.bind(this);
        this.onResizeMouseDown = this.onResizeMouseDown.bind(this);
    }

    componentDidMount() {
        window.addEventListener("mousemove", this.onResizeMouseMove);
        window.addEventListener("mouseup", this.onResizeMouseUp);
    }

    componentWillUnmount() {
        window.removeEventListener("mousemove", this.onResizeMouseMove);
        window.removeEventListener("mouseup", this.onResizeMouseUp);
    }

    onResizeMouseUp() {
        this.setState({ resize: false });
    }

    onResizeMouseMove(e: MouseEvent) {
        if (this.state.resize) {
            let my = e.clientY;
            let mx = e.clientX;
            let width = this.props.parent_size.w;
            let height = this.props.parent_size.h;

            let diffx = mx - this.props.parent_size.w - this.props.parent_pos.x;
            let diffy = my - this.props.parent_size.h - this.props.parent_pos.y;

            if (this.props.pos.x == 0) {
                diffx = 0;
            }
            if (this.props.pos.y == 0) {
                diffy = 0;
            }

            let pos = this.props.parent_pos;
            if (diffx < -this.props.parent_size.w + 50) {
                diffx += this.props.parent_size.w;
                pos.x += diffx;
                width -= diffx;
            } else {
                width += diffx;
            }

            if (diffy < -this.props.parent_size.h + 50) {
                diffy += this.props.parent_size.h;
                pos.y += diffy;
                height -= diffy;
            } else {
                height += diffy;
            }

            this.props.onResize(width, height, pos);
        }
    }

    onResizeMouseDown(){
        this.setState({ resize: true }, () => {
            console.log("down");
        });

        // let [offsetX, offsetY] = [e.clientX - this.props.parent_pos.x, e.clientY - this.props.parent_pos.y];
        // let pos_from = [0, 0];
        // if (offsetX < this.props.parent_size.w / 4) {
        //     pos_from[0] = -1;
        // } else if (offsetX > this.props.parent_size.w / 4 && offsetX < 3 * this.props.parent_size.w / 4) {
        //     pos_from[0] = 0;
        // } else {
        //     pos_from[0] = 1;
        // }
        // if (offsetY < this.props.parent_size.h / 4) {
        //     pos_from[1] = -1;
        // } else if (offsetY > this.props.parent_size.h / 4 && offsetY < 3 * this.props.parent_size.h / 4) {
        //     pos_from[1] = 0;
        // } else {
        //     pos_from[1] = 1;
        // }
        //

    }

    render() {
        return (
            <h1
                style={{
                    position: 'absolute',
                    zIndex: 50,
                    top: this.props.parent_pos.y - 55 + (1 + this.props.pos.y) * this.props.parent_size.h / 2,
                    left: this.props.parent_pos.x - 17 + (1 + this.props.pos.x) * this.props.parent_size.w / 2,
                }}
                onMouseDown={this.onResizeMouseDown}
            >
                *
            </h1>

        );
    }

}
