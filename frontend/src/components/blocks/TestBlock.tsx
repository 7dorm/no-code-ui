import {BaseBlock} from "./BaseBlock";
import '../../styles/components/blocks/blocks.css';

export class TestBlock extends BaseBlock {

    renderBlock() {
        return (
            <div className="glass-element">
                <h1>hello!</h1>
            </div>
        );
    }
}
