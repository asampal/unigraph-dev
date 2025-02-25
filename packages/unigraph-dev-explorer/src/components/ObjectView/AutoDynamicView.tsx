/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-empty-function */
import { Typography } from '@material-ui/core';
import React from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { ErrorBoundary } from 'react-error-boundary';
import { useSwipeable } from 'react-swipeable';
import { buildGraph, UnigraphObject, getRandomInt, getRandomId } from 'unigraph-dev-common/lib/utils/utils';
import { AutoDynamicViewProps } from '../../types/ObjectView.d';
import { subscribeToBacklinks } from '../../unigraph-react';
import { DataContext, DataContextWrapper, isMobile, isMultiSelectKeyPressed, selectUid, TabContext } from '../../utils';
import { getParentsAndReferences } from './backlinksUtils';
import { onUnigraphContextMenu } from './DefaultObjectContextMenu';
import { StringObjectViewer } from './BasicObjectViews';
import { excludableTypes } from './GraphView';
import { getSubentities, isStub, SubentityDropAcceptor } from './utils';
import { registerKeyboardShortcut, removeKeyboardShortcut } from '../../keyboardShortcuts';

export function AutoDynamicView({
    object,
    callbacks,
    components,
    attributes,
    inline,
    allowSubentity,
    allowSemantic = true,
    style,
    noDrag,
    noDrop,
    noContextMenu,
    subentityExpandByDefault,
    noBacklinks,
    noSubentities,
    noParents,
    withParent,
    compact,
    noClickthrough,
    onClick,
    recursive,
    customBoundingBox,
    shortcuts,
    expandedChildren,
    ...props
}: AutoDynamicViewProps) {
    if (!callbacks) callbacks = {};
    allowSubentity = allowSubentity === true;

    if (object.constructor.name !== 'UnigraphObject') object = new UnigraphObject(object);

    const shouldGetBacklinks = !excludableTypes.includes(object?.type?.['unigraph.id']) && !inline;
    const [backlinks, setBacklinks] = React.useState<any>([]);
    const [totalParents, setTotalParents] = React.useState<string[] | undefined>();

    const dataContext = React.useContext(DataContext);
    const tabContext = React.useContext(TabContext);

    const isObjectStub = isStub(object);
    const [loadedObj, setLoadedObj] = React.useState<any>(false);
    const [subsId, setSubsId] = React.useState(0);
    const [componentId, setComponentId] = React.useState(getRandomId());
    const [isRecursion, setIsRecursion] = React.useState<any>(false);
    const getObject = () => (isObjectStub ? loadedObj : object);

    const [showSubentities, setShowSubentities] = React.useState(!!subentityExpandByDefault);

    const [isSelected, setIsSelected] = React.useState(false);
    const [isFocused, setIsFocused] = React.useState(
        window.unigraph.getState('global/focused').value.uid === object?.uid && tabContext.isVisible(),
    );

    const [DynamicViews, setDynamicViews] = React.useState({
        ...window.unigraph.getState('registry/dynamicView').value,
        ...(components || {}),
    });
    const [canClickthrough, setCanClickthrough] = React.useState(
        Object.keys(window.unigraph.getState('registry/dynamicViewDetailed').value).includes(
            getObject()?.type?.['unigraph.id'] || object?.type?.['unigraph.id'],
        ),
    );

    noClickthrough = noClickthrough || DynamicViews[object?.type?.['unigraph.id']]?.noClickthrough;
    noSubentities = noSubentities || DynamicViews[object?.type?.['unigraph.id']]?.noSubentities;
    noDrag = noDrag || DynamicViews[object?.type?.['unigraph.id']]?.noDrag;
    noDrop = noDrop || DynamicViews[object?.type?.['unigraph.id']]?.noDrop;
    noContextMenu = noContextMenu || DynamicViews[object?.type?.['unigraph.id']]?.noContextMenu;
    noBacklinks = noBacklinks || DynamicViews[object?.type?.['unigraph.id']]?.noBacklinks;
    shortcuts = shortcuts || DynamicViews[object?.type?.['unigraph.id']]?.shortcuts;

    const viewEl = React.useRef(null);

    React.useEffect(() => {
        const cb = (newIts: any) =>
            setDynamicViews({
                ...window.unigraph.getState('registry/dynamicView').value,
                ...(components || {}),
            });
        window.unigraph.getState('registry/dynamicView').subscribe(cb);

        const cb2 = (newIts: any) =>
            setCanClickthrough(
                Object.keys(window.unigraph.getState('registry/dynamicViewDetailed').value).includes(
                    getObject()?.type?.['unigraph.id'] || object?.type?.['unigraph.id'],
                ),
            );
        window.unigraph.getState('registry/dynamicViewDetailed').subscribe(cb2);

        const cbsel = (sel: any) => {
            if (sel?.includes?.(componentId)) setIsSelected(true);
            else setIsSelected(false);
        };
        window.unigraph.getState('global/selected').subscribe(cbsel);

        let hasFocus = false;
        const cbfoc = (foc: any) => {
            if (foc.uid === object?.uid && tabContext.isVisible() && !foc?.component?.length) {
                hasFocus = true;
                window.unigraph.getState('global/focused').value.component = componentId;
            }
            if (
                foc.uid === object?.uid &&
                tabContext.isVisible() &&
                window.unigraph.getState('global/focused').value.component === componentId
            )
                setIsFocused(true);
            else setIsFocused(false);
        };
        window.unigraph.getState('global/focused').subscribe(cbfoc);

        const viewElRef = viewEl.current;
        if (window.dragselect && !customBoundingBox && viewEl.current)
            window.dragselect.addSelectables([viewEl.current]);

        return function cleanup() {
            window.unigraph.getState('registry/dynamicView').unsubscribe(cb);
            window.unigraph.getState('registry/dynamicViewDetailed').unsubscribe(cb2);
            window.unigraph.getState('global/selected').unsubscribe(cbsel);
            window.unigraph.getState('global/focused').unsubscribe(cbfoc);
            if (viewElRef) window.dragselect?.removeSelectables([viewElRef]);
            if (hasFocus) {
                const focused = window.unigraph.getState('global/focused');
                focused.setValue({ ...focused.value, component: '' });
            }
        };
    }, []);

    React.useEffect(() => {
        if (typeof shortcuts === 'object' && Object.keys(shortcuts).length > 0) {
            Object.entries(shortcuts).forEach(([key, value]) => {
                registerKeyboardShortcut(componentId, key, value as any);
            });
        }

        return function cleanup() {
            if (typeof shortcuts === 'object' && Object.keys(shortcuts).length > 0) {
                Object.entries(shortcuts).forEach(([key, value]) => {
                    removeKeyboardShortcut(componentId, key);
                });
            }
        };
    }, [shortcuts]);

    React.useEffect(() => {
        if (object?.uid?.startsWith('0x') && shouldGetBacklinks) {
            // console.log(object?.uid, dataContext.getParents(true));
            const cb = (newBacklinks: any) => {
                const [pars, refs] = getParentsAndReferences(
                    newBacklinks['~_value'],
                    newBacklinks['unigraph.origin'],
                    object.uid,
                );
                // console.log(object.uid, getParents(viewEl.current));
                const processedBacklinks: any = [pars, refs].map((it) =>
                    it.filter(
                        (el) =>
                            Object.keys(DynamicViews).includes(el?.type?.['unigraph.id']) &&
                            ![...dataContext.getParents(true), callbacks?.context?.uid].includes(el.uid),
                    ),
                );
                setBacklinks((oldBacklinks: any) => {
                    if (
                        JSON.stringify(oldBacklinks[0]?.map((el: any) => el.uid).sort()) !==
                            JSON.stringify(processedBacklinks[0]?.map((el: any) => el.uid).sort()) ||
                        JSON.stringify(oldBacklinks[1]?.map((el: any) => el.uid).sort()) !==
                            JSON.stringify(processedBacklinks[1]?.map((el: any) => el.uid).sort())
                    ) {
                        return processedBacklinks;
                    }
                    return oldBacklinks;
                });
                setTotalParents((oldParents: any) => {
                    const newParents = [...(pars || []).map((el) => el.uid), ...(refs || []).map((el) => el.uid)];
                    if (JSON.stringify(oldParents?.sort()) !== JSON.stringify(newParents?.sort())) return newParents;
                    return oldParents;
                });
            };
            subscribeToBacklinks(object.uid, cb);
            return function cleanup() {
                subscribeToBacklinks(object.uid, cb, true);
            };
        }
        return () => {};
    }, [
        object?.uid,
        shouldGetBacklinks,
        JSON.stringify(Object.keys(DynamicViews).sort()),
        JSON.stringify(dataContext?.getParents(true)?.sort()),
    ]);

    React.useEffect(() => {
        if (!isObjectStub) setLoadedObj(object);
    }, [object, isObjectStub]);
    const uidRef = React.useRef(undefined);
    React.useEffect(() => {
        const newSubs = getRandomInt();
        if (isObjectStub && object?.uid !== uidRef.current) {
            uidRef.current = object?.uid;
            // console.log(tabContext);
            if (subsId) tabContext.unsubscribe(subsId);
            let query = DynamicViews[object.type?.['unigraph.id']]?.query?.(object.uid);
            if (!query) {
                query = `(func: uid(${object.uid})) @recurse {
                uid
                unigraph.id
                expand(_userpredicate_)
              }`;
            }
            tabContext.subscribeToQuery(
                query,
                (objects: any[]) => {
                    setLoadedObj(buildGraph(objects)[0]);
                },
                newSubs,
                { noExpand: true },
            );
            setSubsId(newSubs);
        }
        if (!isObjectStub) {
            uidRef.current = undefined;
            tabContext.unsubscribe(newSubs);
        }
        return () => {};
    }, [object?.uid, isObjectStub, DynamicViews, object?.type]);

    const [{ isDragging }, drag] = useDrag(() => ({
        type: object?.type?.['unigraph.id'] || '$/schema/any',
        item: {
            uid: object?.uid,
            itemType: object?.type?.['unigraph.id'],
            dndContext: tabContext.viewId,
            dataContext: dataContext.contextUid,
            removeFromContext: callbacks?.removeFromContext,
        },
        collect: (monitor) => {
            if (monitor.isDragging() && window.dragselect) {
                window.dragselect.break();
            }
            return {
                isDragging: !!monitor.isDragging(),
            };
        },
    }));

    const [, drop] = useDrop(() => ({
        accept: window.unigraph.getState('referenceables/semantic_children').value,
        drop: (item: { uid: string; itemType: string }, monitor) => {
            if (!monitor.didDrop() && allowSemantic && !noDrop && item.uid !== object?.uid) {
                window.unigraph.updateObject(object?.uid, {
                    children: [
                        {
                            type: {
                                'unigraph.id': '$/schema/interface/semantic',
                            },
                            _value: {
                                type: { 'unigraph.id': item.itemType },
                                uid: item.uid,
                            },
                        },
                    ],
                });
            }
        },
    }));

    const handlers = useSwipeable({
        onSwipedRight: (eventData) =>
            onUnigraphContextMenu(
                { clientX: eventData.absX, clientY: eventData.absY } as any,
                getObject(),
                contextEntity,
                { ...callbacks, componentId },
            ),
    });

    const contextEntity = typeof callbacks?.context === 'object' ? callbacks.context : null;

    const attach = React.useCallback(
        (domElement) => {
            if (domElement && object?.uid && recursive) {
                const ids = dataContext.getParents();
                if (ids.includes(object?.uid) && !inline) {
                    // recursive - deal with it somehow
                    setIsRecursion(true);
                } else setIsRecursion(false);
            } else if (!object?.uid) {
                setIsRecursion(false);
            }

            if (!noDrag) drag(domElement);
            if (!noDrop) drop(domElement);
            if (isMobile() && !noContextMenu) handlers.ref(domElement);
            viewEl.current = domElement;
        },
        [isDragging, drag],
    );

    const onClickCaptureHandler = React.useCallback(
        (ev) => {
            if (isMultiSelectKeyPressed(ev)) {
                ev.stopPropagation();
                selectUid(componentId, false);
            }
        },
        [componentId],
    );

    const BacklinkComponent = React.useMemo(
        () =>
            shouldGetBacklinks &&
            dataContext.parents !== undefined &&
            (backlinks?.[1]?.length || (!noParents && backlinks?.[0]?.length > 0)) ? (
                <div
                    style={{
                        marginLeft: 'auto',
                        background: 'lightgray',
                        padding: '2px 6px',
                        borderRadius: '6px',
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                    }}
                    onClick={(ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        window.wsnavigator(`/library/backlink?uid=${object?.uid}`);
                    }}
                >
                    {(noParents ? 0 : backlinks?.[0]?.length || 0) + (backlinks?.[1]?.length || 0)}
                </div>
            ) : (
                []
            ),
        [noParents, backlinks[0]?.length, backlinks[1]?.length, dataContext.parents === undefined, shouldGetBacklinks],
    );

    const innerEl = React.useMemo(() => {
        if (
            isRecursion === false &&
            object?.type &&
            object.type['unigraph.id'] &&
            Object.keys(DynamicViews).includes(object.type['unigraph.id']) &&
            getObject()
        ) {
            return React.createElement(DynamicViews[object.type['unigraph.id']].view, {
                data: getObject(),
                ...props,
                callbacks: {
                    viewId: tabContext.viewId,
                    setTitle: tabContext.setTitle,
                    ...(callbacks || {}),
                    ...(noBacklinks ? { BacklinkComponent } : {}),
                    ...(window.dragselect && customBoundingBox
                        ? {
                              registerBoundingBox: (el: any) => {
                                  el.dataset.component = componentId;
                                  window.dragselect.addSelectables([el]);
                                  el.addEventListener('pointerup', onClickCaptureHandler);
                              },
                          }
                        : {}),
                    ...(subsId ? { subsId } : {}),
                },
                ...(attributes || {}),
                inline,
                compact,
                componentId,
                focused: isFocused,
            });
        }
        if (isRecursion === false && object && getObject()) {
            return <StringObjectViewer object={getObject()} />;
        }
        if (isRecursion === true) {
            return (
                <Typography style={{ color: 'red' }}>
                    Recursive element (uid: {object.uid}
                    ), ignored!
                </Typography>
            );
        }
        return '';
    }, [
        isRecursion,
        object,
        callbacks,
        attributes,
        DynamicViews,
        isObjectStub,
        loadedObj,
        isFocused,
        subsId,
        backlinks,
    ]);

    return (
        <ErrorBoundary
            onError={(error: Error, info: { componentStack: string }) => {
                console.error(error);
            }}
            // eslint-disable-next-line react/no-unstable-nested-components
            FallbackComponent={({ error }) => (
                <div
                    style={{
                        backgroundColor: 'floralwhite',
                        borderRadius: '8px',
                    }}
                    onContextMenu={
                        noContextMenu
                            ? () => false
                            : (event) =>
                                  onUnigraphContextMenu(event, getObject(), contextEntity, {
                                      ...callbacks,
                                      componentId,
                                  })
                    }
                >
                    <Typography>
                        Error in AutoDynamicView: (for object
                        {object?.uid})
                    </Typography>
                    <p>{error.message}</p>
                </div>
            )}
        >
            <DataContextWrapper
                contextUid={object?.uid}
                contextData={getObject()}
                parents={totalParents}
                viewType="$/schema/dynamic_view"
                expandedChildren={expandedChildren || false}
            >
                <div
                    style={{
                        display: inline ? 'inline' : 'block',
                        ...(inline ? {} : { width: '100%' }),
                        backgroundColor: isSelected || isDragging ? 'whitesmoke' : 'unset',
                        borderRadius: isSelected || isDragging ? '12px' : '',
                    }}
                    key={`object-view-${object?.uid}`}
                    onClickCapture={customBoundingBox ? () => undefined : onClickCaptureHandler}
                    onClick={(ev) => {
                        if (!noClickthrough && canClickthrough) {
                            typeof onClick === 'function'
                                ? onClick(ev)
                                : (() => {
                                      ev.stopPropagation();
                                      ev.preventDefault();
                                      window.wsnavigator(
                                          `/library/object?uid=${object?.uid}&viewer=${'dynamic-view-detailed'}&type=${
                                              object?.type?.['unigraph.id']
                                          }`,
                                      );
                                  })();
                        }
                    }}
                >
                    <div
                        id={`object-view-${object?.uid}`}
                        data-component={componentId}
                        style={{
                            opacity: isDragging ? 0 : 1,
                            boxSizing: 'border-box',
                            display: 'inline-flex',
                            alignItems: 'center',
                            cursor: noClickthrough || !canClickthrough ? '' : 'pointer',
                            ...(inline ? {} : { width: '100%' }),
                            ...(isMobile() ? { touchAction: 'pan-y' } : {}),
                            ...style,
                        }}
                        aria-label={`Object view for uid ${object?.uid}, of type ${
                            object?.type?.['unigraph.id'] || 'unknown'
                        }`}
                        onContextMenu={
                            noContextMenu
                                ? () => false
                                : (event) =>
                                      onUnigraphContextMenu(event, getObject(), contextEntity, {
                                          ...callbacks,
                                          componentId,
                                      })
                        }
                        {...(attributes || {})}
                        ref={attach}
                    >
                        {innerEl}
                        {noBacklinks ? [] : BacklinkComponent}
                    </div>

                    {!noSubentities && getSubentities(getObject())?.length > 0 ? (
                        <div style={{ width: '100%', paddingLeft: '12px' }}>
                            <Typography
                                onClick={() => {
                                    setShowSubentities(!showSubentities);
                                }}
                                variant="body2"
                                style={{ color: 'gray' }}
                            >
                                {!showSubentities ? '+ show ' : '- hide '}
                                {`${getSubentities(getObject())?.length} subentities`}
                            </Typography>
                            {showSubentities ? (
                                <ul>
                                    {getSubentities(getObject()).map((el: any, index: number) => (
                                        <li>
                                            <AutoDynamicView
                                                object={new UnigraphObject(el._value)}
                                                components={components}
                                                callbacks={{
                                                    ...callbacks,
                                                    context: getObject(),
                                                    index,
                                                    ...(subsId ? { subsId } : {}),
                                                }}
                                                index={index}
                                                noSubentities
                                                noClickthrough={noClickthrough}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                []
                            )}
                        </div>
                    ) : (
                        []
                    )}
                    {allowSubentity && !noDrop ? <SubentityDropAcceptor uid={object?.uid} /> : []}
                </div>
            </DataContextWrapper>
        </ErrorBoundary>
    );
}
