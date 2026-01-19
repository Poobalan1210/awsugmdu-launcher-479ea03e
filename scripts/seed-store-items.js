import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const STORE_ITEMS_TABLE = 'store_items';

const initialItems = [
  {
    id: `item_${Date.now()}_aws`,
    name: 'AWS Credits $25',
    description: '$25 AWS promotional credits for your cloud projects',
    points: 1000,
    image: '💳',
    inStock: true,
    category: 'cloud',
    itemType: 'virtual',
    availableCodes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: `item_${Date.now()}_tshirt`,
    name: 'Community T-Shirt',
    description: 'Exclusive community branded t-shirt',
    points: 1500,
    image: '👕',
    inStock: true,
    category: 'merchandise',
    itemType: 'physical',
    availableCodes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

async function seedStoreItems() {
  console.log('Seeding store items...');
  
  for (const item of initialItems) {
    try {
      const params = {
        TableName: STORE_ITEMS_TABLE,
        Item: item
      };
      
      await docClient.send(new PutCommand(params));
      console.log(`✓ Created: ${item.name}`);
    } catch (error) {
      console.error(`✗ Failed to create ${item.name}:`, error.message);
    }
  }
  
  console.log('\nSeeding complete!');
}

seedStoreItems().catch(console.error);
