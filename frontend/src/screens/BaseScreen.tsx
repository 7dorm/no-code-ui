import {Component} from "preact";
import type {ComponentProps, Context} from "preact";

export abstract class BaseScreen extends Component{
    protected constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
    }

    saveLayout(state: any) {
        console.log("getCurrentState", state);
    }

}
