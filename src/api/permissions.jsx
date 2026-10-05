import React, { createContext, useContext } from 'react';
const Context=createContext([]);
export function PermissionProvider({permissions,children}) { return <Context.Provider value={permissions||[]}>{children}</Context.Provider>; }
export function hasPermission(permissions,resource,action='read') { return permissions.includes('*')||permissions.includes(resource+':*')||permissions.includes(resource+':'+action); }
export function usePermission(resource,action='read') { return hasPermission(useContext(Context),resource,action); }
