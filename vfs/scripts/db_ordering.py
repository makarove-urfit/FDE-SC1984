REFS = [
    {"table_name": "sale_orders",        "columns": ["id", "name", "state", "date_order", "customer_id", "note", "amount_total"],                                                                       "permissions": ["read", "create", "update"]},
    {"table_name": "sale_order_lines",   "columns": ["id", "order_id", "product_id", "product_template_id", "product_uom_qty", "price_unit", "name", "delivery_date"],                                 "permissions": ["read", "create", "update"]},
    {"table_name": "product_templates",  "columns": ["id", "name", "default_code", "sale_ok", "active", "categ_id", "list_price", "uom_id"],                                                           "permissions": ["read"]},
    {"table_name": "product_categories", "columns": ["id", "name", "parent_id", "active"],                                                                                                             "permissions": ["read"]},
    {"table_name": "product_product",    "columns": ["id", "product_tmpl_id", "active"],                                                                                                               "permissions": ["read"]},
    {"table_name": "customers",          "columns": ["id", "name", "email", "ref", "customer_type"],                                                                                                   "permissions": ["read", "create"]},
    {"table_name": "uom_uom",            "columns": ["id", "name", "active"],                                                                                                                          "permissions": ["read"]},
    {"table_name": "x_app_settings",     "columns": ["id", "key", "value"],                                                                                                                            "permissions": ["read"]},
    {"table_name": "x_holiday_settings", "columns": ["id", "date", "reason"],                                                                                                                          "permissions": ["read"]},
    {"table_name": "x_product_product_price_log", "columns": ["id", "product_product_id", "lst_price", "effective_date"],                                                                              "permissions": ["read"]},
]
