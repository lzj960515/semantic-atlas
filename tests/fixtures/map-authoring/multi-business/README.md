# Parcel Shop

This service sells goods, arranges their delivery, and reports sales revenue.
The implementation is grouped by technical responsibility in `src/`, not by
business team.

Customers place orders with a positive total. Orders become durable records,
and successful checkout publishes an Order placed event. Customers can cancel
only while their order is awaiting shipment. Cancellation is a customer-order
rule and does not itself create a delivery.

Warehouse operators turn Order placed events into shipment requests. Dispatch
requires a delivery address; orders without an address remain pending for
correction. Dispatch writes a shipment record and marks the order shipped.

Finance analysts record paid totals from Order placed events in the sales
ledger. Their daily revenue report reads that ledger and excludes cancelled
orders. The report has no authority to dispatch shipments or accept orders.
