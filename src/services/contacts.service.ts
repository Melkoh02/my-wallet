import * as Contacts from "expo-contacts";

export type SimpleContact = {
  id: string;
  name: string;
};

let _hasPermission: boolean | null = null;

export async function hasContactsPermission(): Promise<boolean> {
  if (_hasPermission !== null) return _hasPermission;
  const { status } = await Contacts.getPermissionsAsync();
  _hasPermission = status === "granted";
  return _hasPermission;
}

export async function requestContactsPermission(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  _hasPermission = status === "granted";
  return _hasPermission;
}

export async function searchContacts(query: string): Promise<SimpleContact[]> {
  if (!(await hasContactsPermission())) return [];
  if (!query.trim()) return [];

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name],
    name: query,
    pageSize: 20,
  });

  return data
    .filter((c) => c.name)
    .map((c) => ({
      id: c.id,
      name: c.name!,
    }));
}

export async function getContactById(id: string): Promise<SimpleContact | null> {
  if (!(await hasContactsPermission())) return null;
  const contact = await Contacts.getContactByIdAsync(id, [Contacts.Fields.Name]);
  if (!contact?.name) return null;
  return { id: contact.id, name: contact.name };
}
