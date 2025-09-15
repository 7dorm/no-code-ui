import {BaseUI} from "./BaseUI";
import type {ComponentChild, Context} from "preact";
import "../../styles/components/UI/SideBarUIStyle.css";
import ScrollListBlock from "../blocks/ScrollListBlock.tsx";
import {route} from "preact-router";

export class SideBarUI extends BaseUI {
    elements: Array<any> = [];

    position = {x: 0, y: 0};
    size= {w: 220, h: 880}

    constructor(props: any, context?: Context<any>) {
        super(props, context);
        this.elements = [
            <button onClick={props.createComponent}>Create</button>,
            <button onClick={() => {route("/")}}>go back</button>
        ];
    }

    render(): ComponentChild {
        return (
            <>
                <div
                    className={`side-bar glass-element`}
                    style={{
                        width: this.size.w,
                        height: this.size.h,
                        top: this.position.y,
                        left: this.position.x,
                    }}
                >
                    <ScrollListBlock items = {this.elements}/>
                </div>
            </>);
    }
}
