import type { DatabaseProject } from '../types/schema';

export const ECOMMERCE_TEMPLATE: DatabaseProject = {
  id: 'template-ecommerce',
  name: 'E-Commerce Platform',
  engine: 'postgresql',
  schemas: [
    { id: 'schema-auth', name: 'auth', color: '#6366f1', comment: 'Authentication & Users' },
    { id: 'schema-catalog', name: 'catalog', color: '#10b981', comment: 'Products & Inventory' },
    { id: 'schema-sales', name: 'sales', color: '#f59e0b', comment: 'Orders & Payments' }
  ],
  enums: [
    { id: 'enum-order-status', name: 'OrderStatus', values: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], schemaId: 'schema-sales', position: { x: 1250, y: 100 } }
  ],
  tables: [
    {
      id: 'table-users',
      name: 'users',
      schemaId: 'schema-auth',
      position: { x: 50, y: 100 },
      color: '#6366f1',
      columns: [
        { id: 'u-1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true, defaultValue: 'gen_random_uuid()' },
        { id: 'u-2', name: 'email', type: 'VARCHAR', isPrimaryKey: false, isNullable: false, isUnique: true },
        { id: 'u-3', name: 'password_hash', type: 'VARCHAR', isPrimaryKey: false, isNullable: false, isUnique: false },
        { id: 'u-4', name: 'full_name', type: 'VARCHAR', isPrimaryKey: false, isNullable: true, isUnique: false },
        { id: 'u-5', name: 'is_active', type: 'BOOLEAN', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: 'true' },
        { id: 'u-6', name: 'created_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: 'NOW()' }
      ]
    },
    {
      id: 'table-categories',
      name: 'categories',
      schemaId: 'schema-catalog',
      position: { x: 450, y: 100 },
      color: '#10b981',
      columns: [
        { id: 'c-1', name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false, isUnique: true, isAutoIncrement: true },
        { id: 'c-2', name: 'name', type: 'VARCHAR', isPrimaryKey: false, isNullable: false, isUnique: true },
        { id: 'c-3', name: 'slug', type: 'VARCHAR', isPrimaryKey: false, isNullable: false, isUnique: true },
        { id: 'c-4', name: 'description', type: 'TEXT', isPrimaryKey: false, isNullable: true, isUnique: false }
      ]
    },
    {
      id: 'table-products',
      name: 'products',
      schemaId: 'schema-catalog',
      position: { x: 450, y: 350 },
      color: '#10b981',
      columns: [
        { id: 'p-1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true },
        { id: 'p-2', name: 'title', type: 'VARCHAR', isPrimaryKey: false, isNullable: false, isUnique: false },
        { id: 'p-3', name: 'price', type: 'DECIMAL', isPrimaryKey: false, isNullable: false, isUnique: false },
        { id: 'p-4', name: 'stock_quantity', type: 'INT', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: '0' },
        { id: 'p-5', name: 'category_id', type: 'INT', isPrimaryKey: false, isNullable: true, isUnique: false, foreignKey: { targetTableId: 'table-categories', targetColumnId: 'c-1', onDelete: 'SET NULL' } },
        { id: 'p-6', name: 'created_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: 'NOW()' }
      ]
    },
    {
      id: 'table-orders',
      name: 'orders',
      schemaId: 'schema-sales',
      position: { x: 850, y: 100 },
      color: '#f59e0b',
      columns: [
        { id: 'o-1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true },
        { id: 'o-2', name: 'user_id', type: 'UUID', isPrimaryKey: false, isNullable: false, isUnique: false, foreignKey: { targetTableId: 'table-users', targetColumnId: 'u-1', onDelete: 'CASCADE' } },
        { id: 'o-3', name: 'total_amount', type: 'DECIMAL', isPrimaryKey: false, isNullable: false, isUnique: false },
        { id: 'o-4', name: 'status', type: 'ENUM', enumName: 'OrderStatus', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: 'pending' },
        { id: 'o-5', name: 'created_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: 'NOW()' }
      ]
    },
    {
      id: 'table-order-items',
      name: 'order_items',
      schemaId: 'schema-sales',
      position: { x: 850, y: 450 },
      color: '#f59e0b',
      columns: [
        { id: 'oi-1', name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false, isUnique: true, isAutoIncrement: true },
        { id: 'oi-2', name: 'order_id', type: 'UUID', isPrimaryKey: false, isNullable: false, isUnique: false, foreignKey: { targetTableId: 'table-orders', targetColumnId: 'o-1', onDelete: 'CASCADE' } },
        { id: 'oi-3', name: 'product_id', type: 'UUID', isPrimaryKey: false, isNullable: false, isUnique: false, foreignKey: { targetTableId: 'table-products', targetColumnId: 'p-1', onDelete: 'RESTRICT' } },
        { id: 'oi-4', name: 'quantity', type: 'INT', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: '1' },
        { id: 'oi-5', name: 'unit_price', type: 'DECIMAL', isPrimaryKey: false, isNullable: false, isUnique: false }
      ]
    }
  ]
};

export const SAAS_TEMPLATE: DatabaseProject = {
  id: 'template-saas',
  name: 'SaaS Workspace & Subscriptions',
  engine: 'postgresql',
  schemas: [
    { id: 'schema-core', name: 'core', color: '#ec4899', comment: 'Core Entities' },
    { id: 'schema-billing', name: 'billing', color: '#8b5cf6', comment: 'Subscriptions' }
  ],
  enums: [
    { id: 'enum-plan-tier', name: 'PlanTier', values: ['free', 'pro', 'enterprise'], schemaId: 'schema-billing', position: { x: 1250, y: 150 } }
  ],
  tables: [
    {
      id: 'table-users-saas',
      name: 'users',
      schemaId: 'schema-core',
      position: { x: 100, y: 150 },
      color: '#ec4899',
      columns: [
        { id: 'su-1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true },
        { id: 'su-2', name: 'email', type: 'VARCHAR', isPrimaryKey: false, isNullable: false, isUnique: true },
        { id: 'su-3', name: 'avatar_url', type: 'VARCHAR', isPrimaryKey: false, isNullable: true, isUnique: false }
      ]
    },
    {
      id: 'table-orgs',
      name: 'organizations',
      schemaId: 'schema-core',
      position: { x: 500, y: 150 },
      color: '#ec4899',
      columns: [
        { id: 'org-1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true },
        { id: 'org-2', name: 'name', type: 'VARCHAR', isPrimaryKey: false, isNullable: false, isUnique: false },
        { id: 'org-3', name: 'slug', type: 'VARCHAR', isPrimaryKey: false, isNullable: false, isUnique: true }
      ]
    },
    {
      id: 'table-subscriptions',
      name: 'subscriptions',
      schemaId: 'schema-billing',
      position: { x: 900, y: 150 },
      color: '#8b5cf6',
      columns: [
        { id: 'sub-1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true },
        { id: 'sub-2', name: 'org_id', type: 'UUID', isPrimaryKey: false, isNullable: false, isUnique: false, foreignKey: { targetTableId: 'table-orgs', targetColumnId: 'org-1', onDelete: 'CASCADE' } },
        { id: 'sub-3', name: 'stripe_customer_id', type: 'VARCHAR', isPrimaryKey: false, isNullable: true, isUnique: true },
        { id: 'sub-4', name: 'plan_tier', type: 'ENUM', enumName: 'PlanTier', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: 'pro' },
        { id: 'sub-5', name: 'is_active', type: 'BOOLEAN', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: 'true' }
      ]
    }
  ]
};

export const BLOG_TEMPLATE: DatabaseProject = {
  id: 'template-blog',
  name: 'Blog & CMS',
  engine: 'postgresql',
  schemas: [
    { id: 'schema-blog', name: 'content', color: '#10b981', comment: 'Editorial posts, tags & discussions' }
  ],
  enums: [
    { id: 'enum-post-status', name: 'PostStatus', values: ['draft', 'published', 'archived'], schemaId: 'schema-blog', position: { x: 1020, y: 100 } }
  ],
  tables: [
    {
      id: 'table-authors',
      name: 'authors',
      schemaId: 'schema-blog',
      position: { x: 640, y: 100 },
      color: '#6366f1',
      columns: [
        { id: 'au-1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true, defaultValue: 'gen_random_uuid()' },
        { id: 'au-2', name: 'handle', type: 'VARCHAR', length: 64, isPrimaryKey: false, isNullable: false, isUnique: true },
        { id: 'au-3', name: 'display_name', type: 'VARCHAR', length: 120, isPrimaryKey: false, isNullable: false, isUnique: false },
        { id: 'au-4', name: 'bio', type: 'TEXT', isPrimaryKey: false, isNullable: true, isUnique: false }
      ]
    },
    {
      id: 'table-posts',
      name: 'posts',
      schemaId: 'schema-blog',
      position: { x: 360, y: 80 },
      color: '#10b981',
      indexes: [
        { id: 'idx-posts-author-status', name: 'idx_posts_author_status', columnNames: ['author_id', 'status'], isUnique: false }
      ],
      columns: [
        { id: 'po-1', name: 'id', type: 'UUID', isPrimaryKey: true, isNullable: false, isUnique: true, defaultValue: 'gen_random_uuid()' },
        { id: 'po-2', name: 'author_id', type: 'UUID', isPrimaryKey: false, isNullable: false, isUnique: false, foreignKey: { targetTableId: 'table-authors', targetColumnId: 'au-1', onDelete: 'CASCADE' } },
        { id: 'po-3', name: 'slug', type: 'VARCHAR', length: 160, isPrimaryKey: false, isNullable: false, isUnique: true },
        { id: 'po-4', name: 'title', type: 'VARCHAR', length: 200, isPrimaryKey: false, isNullable: false, isUnique: false },
        { id: 'po-5', name: 'body', type: 'TEXT', isPrimaryKey: false, isNullable: false, isUnique: false },
        { id: 'po-6', name: 'status', type: 'ENUM', enumName: 'PostStatus', isPrimaryKey: false, isNullable: false, isUnique: false, defaultValue: 'draft' },
        { id: 'po-7', name: 'published_at', type: 'TIMESTAMP', isPrimaryKey: false, isNullable: true, isUnique: false }
      ]
    },
    {
      id: 'table-tags',
      name: 'tags',
      schemaId: 'schema-blog',
      position: { x: 640, y: 340 },
      color: '#f59e0b',
      columns: [
        { id: 'tg-1', name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false, isUnique: true, isAutoIncrement: true },
        { id: 'tg-2', name: 'name', type: 'VARCHAR', length: 48, isPrimaryKey: false, isNullable: false, isUnique: true }
      ]
    },
    {
      id: 'table-post-tags',
      name: 'post_tags',
      schemaId: 'schema-blog',
      position: { x: 80, y: 120 },
      color: '#ec4899',
      indexes: [
        { id: 'idx-post-tags-unique', name: 'uq_post_tags_pair', columnNames: ['post_id', 'tag_id'], isUnique: true }
      ],
      columns: [
        { id: 'pt-1', name: 'id', type: 'INT', isPrimaryKey: true, isNullable: false, isUnique: true, isAutoIncrement: true },
        { id: 'pt-2', name: 'post_id', type: 'UUID', isPrimaryKey: false, isNullable: false, isUnique: false, foreignKey: { targetTableId: 'table-posts', targetColumnId: 'po-1', onDelete: 'CASCADE' } },
        { id: 'pt-3', name: 'tag_id', type: 'INT', isPrimaryKey: false, isNullable: false, isUnique: false, foreignKey: { targetTableId: 'table-tags', targetColumnId: 'tg-1', onDelete: 'CASCADE' } }
      ]
    }
  ]
};

export interface StarterTemplateMeta {
  id: string
  name: string
  description: string
  icon: string
  engine: DatabaseProject['engine']
  project: DatabaseProject
}

export const PROJECT_TEMPLATES: StarterTemplateMeta[] = [
  {
    id: 'ecommerce',
    name: 'E-Commerce Platform',
    description: 'Auth, product catalog, inventory, and orders across 3 PostgreSQL schemas.',
    icon: 'i-ph-shopping-cart',
    engine: 'postgresql',
    project: ECOMMERCE_TEMPLATE
  },
  {
    id: 'saas',
    name: 'SaaS Multi-Tenant',
    description: 'Users, organizations, Stripe customer billing, and plan tier enums.',
    icon: 'i-ph-buildings',
    engine: 'postgresql',
    project: SAAS_TEMPLATE
  },
  {
    id: 'blog',
    name: 'Blog & CMS',
    description: 'Authors, editorial posts with workflow status enum, and many-to-many tags.',
    icon: 'i-ph-article',
    engine: 'postgresql',
    project: BLOG_TEMPLATE
  }
];
