import { Grid, ListItemIcon, Typography } from '@material-ui/core';
import Icon from '@mdi/react';
import { mdiFeatureSearchOutline, mdiAppsBox, mdiInboxOutline, mdiViewQuiltOutline } from '@mdi/js';
import React from 'react';
import { getRandomInt } from 'unigraph-dev-common/lib/utils/utils';
import { TabContext } from '../../utils';

type AppShortcutProps = {
    avatar: React.ReactElement<any>;
    address: string;
    text: string;
};

export function AppShortcut({ avatar, address, text }: AppShortcutProps) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px',
            }}
            onClick={() => window.wsnavigator(address)}
        >
            {avatar}
            {text}
        </div>
    );
}

export function AllApps() {
    const [totalViews, setTotalViews] = React.useState([]);
    const tabContext = React.useContext(TabContext);
    React.useEffect(() => {
        const viewId = getRandomInt();

        tabContext.subscribeToType(
            '$/schema/view',
            (views: any) => {
                setTotalViews(views.filter((el: any) => el['unigraph.id']?.length > 0));
            },
            viewId,
        );

        return function cleanup() {
            tabContext.unsubscribe(viewId);
        };
    }, []);

    return (
        <Grid container spacing={2}>
            <Grid item xs={3} lg={2}>
                <AppShortcut
                    avatar={<Icon path={mdiFeatureSearchOutline} size={1} />}
                    address="/search"
                    text="Search"
                />
            </Grid>
            <Grid item xs={3} lg={2}>
                <AppShortcut avatar={<Icon path={mdiInboxOutline} size={1} />} address="/inbox" text="Inbox" />
            </Grid>
            {totalViews.map((el: any) => (
                <Grid item xs={3} lg={2}>
                    <AppShortcut
                        avatar={
                            el?._value?.icon ? (
                                <ListItemIcon
                                    style={{
                                        minWidth: '24px',
                                        minHeight: '24px',
                                        backgroundImage: `url("${el?._value?.icon?._value?.['_value.%']}")`,
                                    }}
                                />
                            ) : (
                                <Icon path={mdiViewQuiltOutline} size={1} />
                            )
                        }
                        address={`/${el?._value?.view?._value?.uid || el?._value?.view?.['_value.%']?.slice(7)}`}
                        text={el?.get('name')?.as('primitive')}
                    />
                </Grid>
            ))}
            <Grid item xs={3} lg={2}>
                <AppShortcut avatar={<Icon path={mdiAppsBox} size={1} />} address="/app-library" text="All Apps" />
            </Grid>
        </Grid>
    );
}

export function AppLibraryWidget({}) {
    return (
        <div style={{ overflowY: 'auto', height: '100%' }}>
            <Typography variant="h5">Recommended Apps</Typography>
            <AllApps />
        </div>
    );
}
