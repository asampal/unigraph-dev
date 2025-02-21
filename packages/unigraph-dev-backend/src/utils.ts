import _ from 'lodash';

// eslint-disable-next-line import/prefer-default-export
export function mergeWithConcatArray(objValue: any, srcValue: any) {
    if (_.isArray(objValue)) {
        return objValue.concat(srcValue);
    }
    return undefined;
}
