import * as Handlebars from 'handlebars';

import { TupleDataItem } from 'ethereum-types';

import { utils } from './utils';

export const pythonHandlebarsHelpers = {
    tupleAssignment: (py_tuple_name: string, tuple_abi_json: string) => {
        const tuple_abi = JSON.parse(tuple_abi_json);
        const pythonClassName = utils.makePythonTupleName(tuple_abi.components);
        let assignment = `${pythonClassName}(`;
        let i = 0;
        for (const component of tuple_abi.components) {
            assignment += `${component.name}=${py_tuple_name}[${i}],`;
            i++;
        }
        assignment += ')';
        return new Handlebars.SafeString(assignment);
    },
};
