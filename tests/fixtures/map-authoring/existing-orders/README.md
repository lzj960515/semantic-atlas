# Parcel Shop

Customers place orders with a positive total. Orders become durable records,
and successful checkout publishes an Order placed event. Customers can cancel
only while their order is awaiting shipment. Existing order behavior remains
supported after the delivery feature was added.

Warehouse operators now receive Order placed events and create shipment
requests. Dispatch requires a delivery address; a missing address or an order
that is no longer awaiting shipment leaves the request unfulfilled. Successful
dispatch records the shipment and marks the shared order shipped. This feature
serves warehouse staff and their delivery rules; receiving an event alone does
not mean that shipment has succeeded.

`src/records.ts` contains shared record types and `src/actions.ts` contains the
current actions. The checked-in business map describes the older order behavior.
