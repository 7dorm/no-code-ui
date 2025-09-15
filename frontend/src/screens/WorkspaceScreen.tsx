import {BaseScreen} from "./BaseScreen.tsx";
import type {ComponentChildren, ComponentProps, Context} from "preact";
import {SideBarUI} from "../components/UI/SideBarUI.tsx";
import {TestBlock} from "../components/blocks/TestBlock.tsx";
// import {route} from "preact-router";

export class WorkspaceScreen extends BaseScreen {
    state = {
        objects: []
    }

    constructor(props?: ComponentProps<any>, context?: Context<any>) {
        super(props, context);
        this.createComponent = this.createComponent.bind(this);
    }

    createComponent() {
        this.setState({
                objects: [...this.state.objects, <TestBlock saveLayout={this.saveLayout}/>]
            }
        )
        console.log(this.state.objects);
    }

    render(): ComponentChildren {
        return (
            <div>
                <SideBarUI createComponent={this.createComponent}/>
                {this.state.objects}
            </div>
        );
    }
}
