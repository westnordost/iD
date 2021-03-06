import { t } from '../util/locale';
import { modeDrawLine } from '../modes/draw_line';
import { actionReverse } from '../actions/reverse';
import { utilDisplayLabel } from '../util';
import { osmFlowingWaterwayTagValues, osmOneWayTags, osmRoutableHighwayTagValues } from '../osm/tags';
import { validationIssue, validationIssueFix } from '../core/validation';


export function validationImpossibleOneway() {
    var type = 'impossible_oneway';

    function typeForWay(way) {
        if (osmRoutableHighwayTagValues[way.tags.highway]) return 'highway';
        if (osmFlowingWaterwayTagValues[way.tags.waterway]) return 'waterway';
        return null;
    }

    function isOneway(way) {
        if (way.tags.oneway === 'yes') return true;
        if (way.tags.oneway) return false;

        for (var key in way.tags) {
            if (osmOneWayTags[key] && osmOneWayTags[key][way.tags[key]]) {
                return true;
            }
        }
        return false;
    }

    function continueDrawing(way, vertex, context) {
        // make sure the vertex is actually visible and editable
        var map = context.map();
        if (!map.editable() || !map.trimmedExtent().contains(vertex.loc)) {
            map.zoomToEase(vertex);
        }

        context.enter(
            modeDrawLine(context, way.id, context.graph(), context.graph(), 'line', way.affix(vertex.id), true)
        );
    }

    function nodeOccursMoreThanOnce(way, nodeID) {
        var occurences = 0;
        for (var index in way.nodes) {
            if (way.nodes[index] === nodeID) {
                occurences += 1;
                if (occurences > 1) return true;
            }
        }
        return false;
    }

    function issuesForNode(context, way, nodeID) {

        var isFirst = nodeID === way.first();

        var wayType = typeForWay(way);
        var isWaterway = wayType === 'waterway';

        // ignore if this way is self-connected at this node
        if (nodeOccursMoreThanOnce(way, nodeID)) return [];

        var osm = context.connection();
        if (!osm) return [];

        var node = context.hasEntity(nodeID);

        // ignore if this node or its tile are unloaded
        if (!node || !osm.isDataLoaded(node.loc)) return [];

        var attachedWaysOfSameType = context.graph().parentWays(node).filter(function(parentWay) {
            if (parentWay.id === way.id) return false;
            return typeForWay(parentWay) === wayType;
        });

        // assume it's okay for waterways to start or end disconnected for now
        if (isWaterway && attachedWaysOfSameType.length === 0) return [];

        var attachedOneways = attachedWaysOfSameType.filter(function(attachedWay) {
            return isOneway(attachedWay);
        });

        // ignore if the way is connected to some non-oneway features
        if (attachedOneways.length < attachedWaysOfSameType.length) return [];

        if (attachedOneways.length) {
            var connectedEndpointsOkay = attachedOneways.some(function(attachedOneway) {
                if ((isFirst ? attachedOneway.first() : attachedOneway.last()) !== nodeID) return true;
                if (nodeOccursMoreThanOnce(attachedOneway, nodeID)) return true;
                return false;
            });
            if (connectedEndpointsOkay) return [];
        }

        var fixes = [];

        if (attachedOneways.length) {
            fixes.push(new validationIssueFix({
                icon: 'iD-operation-reverse',
                title: t('issues.fix.reverse_feature.title'),
                entityIds: [way.id],
                onClick: function() {
                    var id = this.issue.entityIds[0];
                    context.perform(actionReverse(id), t('operations.reverse.annotation'));
                }
            }));
        }
        if (node.tags.noexit !== 'yes') {
            fixes.push(new validationIssueFix({
                icon: 'iD-operation-continue' + (isFirst ? '-left' : ''),
                title: t('issues.fix.continue_from_' + (isFirst ? 'start' : 'end') + '.title'),
                onClick: function() {
                    var entityID = this.issue.entityIds[0];
                    var vertexID = this.issue.entityIds[1];
                    var way = context.entity(entityID);
                    var vertex = context.entity(vertexID);
                    continueDrawing(way, vertex, context);
                }
            }));
        }

        var placement = isFirst ? 'start' : 'end',
            messageID = wayType + '.',
            referenceID = wayType + '.';

        if (isWaterway) {
            messageID += 'connected.' + placement;
            referenceID += 'connected';
        } else {
            messageID += placement;
            referenceID += placement;
        }

        return [new validationIssue({
            type: type,
            subtype: wayType,
            severity: 'warning',
            message: t('issues.impossible_oneway.' + messageID + '.message', {
                feature: utilDisplayLabel(way, context)
            }),
            reference: getReference(referenceID),
            entityIds: [way.id, node.id],
            fixes: fixes
        })];

        function getReference(referenceID) {
            return function showReference(selection) {
                selection.selectAll('.issue-reference')
                    .data([0])
                    .enter()
                    .append('div')
                    .attr('class', 'issue-reference')
                    .text(t('issues.impossible_oneway.' + referenceID + '.reference'));
            };
        }
    }

    var validation = function checkDisconnectedWay(entity, context) {

        if (entity.type !== 'way' || entity.geometry(context.graph()) !== 'line') return [];

        if (entity.isClosed()) return [];

        if (!typeForWay(entity)) return [];

        if (!isOneway(entity)) return [];

        var firstIssues = issuesForNode(context, entity, entity.first());
        var lastIssues = issuesForNode(context, entity, entity.last());

        return firstIssues.concat(lastIssues);
    };


    validation.type = type;

    return validation;
}
