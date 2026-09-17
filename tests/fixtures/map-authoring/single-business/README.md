# Visit Cancellation

A small appointment service lets a customer cancel a confirmed visit until
24 hours before its start. A successful cancellation changes the appointment
status. A late request leaves the visit confirmed and returns a refusal. The
HTTP adapter, cancellation rule and storage adapter are three technical parts
of that one business responsibility.
