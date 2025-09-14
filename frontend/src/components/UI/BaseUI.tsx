import {Component} from "preact";
import type {ComponentProps, Context} from "preact";

export abstract class BaseUI extends Component{
    protected constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
    }
}
