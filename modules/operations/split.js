import { t } from '../util/locale';
import { actionSplit } from '../actions/split';
import { behaviorOperation } from '../behavior/operation';
import { modeSelect } from '../modes/select';


export function operationSplit(selectedIDs, context) {
    var vertices = selectedIDs
        .filter(function(id) { return context.geometry(id) === 'vertex'; });
    var entityID = vertices[0];
    var action = actionSplit(entityID);
    var ways = [];
    var _disabled;

    if (vertices.length === 1) {
        if (entityID && selectedIDs.length > 1) {
            var ids = selectedIDs.filter(function(id) { return id !== entityID; });
            action.limitWays(ids);
        }
        ways = action.ways(context.graph());
    }


    var operation = function() {
        var difference = context.perform(action, operation.annotation());
        context.enter(modeSelect(context, difference.extantIDs()));
    };


    operation.available = function() {
        return vertices.length === 1;
    };


    operation.disabled = function() {
        if (_disabled !== undefined) return _disabled;

        _disabled = action.disabled(context.graph());
        if (_disabled) {
            return _disabled;
        } else if (selectedIDs.some(context.hasHiddenConnections)) {
            return _disabled = 'connected_to_hidden';
        }

        return _disabled = false;
    };


    operation.tooltip = function() {
        var disable = operation.disabled();
        if (disable) {
            return t('operations.split.' + disable);
        } else if (ways.length === 1) {
            return t('operations.split.description.' + context.geometry(ways[0].id));
        } else {
            return t('operations.split.description.multiple');
        }
    };


    operation.annotation = function() {
        return ways.length === 1 ?
            t('operations.split.annotation.' + context.geometry(ways[0].id)) :
            t('operations.split.annotation.multiple', { n: ways.length });
    };


    operation.id = 'split';
    operation.keys = [t('operations.split.key')];
    operation.title = t('operations.split.title');
    operation.behavior = behaviorOperation(context).which(operation);

    return operation;
}
