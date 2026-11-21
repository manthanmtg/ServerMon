import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DatabasesPage from './DatabasesPage';

describe('DatabasesPage', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ databases: [] }),
    } as Response);
  });

  it('opens a database creation modal with templates, credentials, storage, and exposure settings', async () => {
    render(<DatabasesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'New Database' }));
    const dialog = screen.getByRole('dialog', { name: 'New Database' });

    expect(within(dialog).getByLabelText('Template')).toHaveValue('postgres');
    expect(within(dialog).getByLabelText('Major version')).toBeTruthy();
    expect(within(dialog).getByLabelText('Database name')).toBeTruthy();
    expect(within(dialog).getByLabelText('Username')).toBeTruthy();
    expect(within(dialog).getByLabelText('Password')).toBeTruthy();
    expect(within(dialog).getByLabelText('Host port')).toBeTruthy();
    expect(within(dialog).getByLabelText('Local only')).toBeChecked();
    expect(within(dialog).getByLabelText('Public route')).toBeTruthy();
    expect(within(dialog).getByText(/data lives on this machine/i)).toBeTruthy();
  });

  it('submits public route database settings to the API', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ databases: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ database: { id: 'db-1', name: 'Public Mongo' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ databases: [] }),
      } as Response);

    render(<DatabasesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'New Database' }));
    const dialog = screen.getByRole('dialog', { name: 'New Database' });

    fireEvent.change(within(dialog).getByLabelText('Template'), { target: { value: 'mongo' } });
    fireEvent.change(within(dialog).getByLabelText('Database name'), {
      target: { value: 'Public Mongo' },
    });
    fireEvent.change(within(dialog).getByLabelText('Username'), { target: { value: 'root' } });
    fireEvent.change(within(dialog).getByLabelText('Password'), {
      target: { value: 'mongo-pass' },
    });
    fireEvent.change(within(dialog).getByLabelText('Initial database'), {
      target: { value: 'appdb' },
    });
    fireEvent.change(within(dialog).getByLabelText('Host port'), { target: { value: '27018' } });
    fireEvent.click(within(dialog).getByLabelText('Public route'));
    fireEvent.click(within(dialog).getByLabelText('I understand this exposes the database port'));
    fireEvent.click(within(dialog).getByRole('button', { name: /create database/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1].body);
    expect(body).toMatchObject({
      templateId: 'mongo',
      name: 'Public Mongo',
      username: 'root',
      password: 'mongo-pass',
      databaseName: 'appdb',
      port: 27018,
      publicRoute: true,
    });
  });

  it('renders database details with masked connection string and deploy controls', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        databases: [
          {
            id: 'db-1',
            name: 'Main Postgres',
            slug: 'main-postgres',
            templateId: 'postgres',
            version: '17',
            image: 'postgres:17',
            host: '127.0.0.1',
            port: 5432,
            internalPort: 5432,
            username: 'servermon',
            databaseName: 'servermon',
            dataPath: '/var/lib/servermon/databases/main-postgres/data',
            publicRoute: false,
            bindAddress: '127.0.0.1',
            sslMode: 'disable',
            restartPolicy: 'unless-stopped',
            status: 'draft',
            connection: {
              maskedUri: 'postgresql://servermon:********@127.0.0.1:5432/servermon',
              cli: 'psql "postgresql://servermon:********@127.0.0.1:5432/servermon"',
            },
            securityNotes: [],
            logs: [],
          },
        ],
      }),
    } as Response);

    render(<DatabasesPage />);
    await screen.findByText('Main Postgres');

    expect(screen.getByText('/var/lib/servermon/databases/main-postgres/data')).toBeTruthy();
    expect(
      screen.getByText('postgresql://servermon:********@127.0.0.1:5432/servermon')
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deploy Main Postgres' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Copy connection string for Main Postgres' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expand Main Postgres' })).toBeTruthy();
    expect(screen.queryByText('Activity')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand Main Postgres' }));

    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getAllByText('No deployment activity yet.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Collapse Main Postgres' })).toBeTruthy();
  });

  it('shows a one-click explore action beside database runtime controls', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        databases: [
          {
            id: 'db-1',
            name: 'Main Mongo',
            slug: 'main-mongo',
            templateId: 'mongo',
            version: '8',
            image: 'mongo:8',
            host: '127.0.0.1',
            port: 27017,
            internalPort: 27017,
            username: 'root',
            databaseName: 'appdb',
            dataPath: '/var/lib/servermon/databases/main-mongo/data',
            publicRoute: false,
            bindAddress: '127.0.0.1',
            sslMode: 'disable',
            restartPolicy: 'unless-stopped',
            status: 'running',
            connection: {
              maskedUri: 'mongodb://root:********@127.0.0.1:27017/appdb?authSource=admin',
              cli: 'mongodb://root:********@127.0.0.1:27017/appdb?authSource=admin',
            },
            explorer: { status: 'stopped', kind: 'mongo-express' },
            securityNotes: [],
            logs: [],
          },
        ],
      }),
    } as Response);

    render(<DatabasesPage />);
    await screen.findByText('Main Mongo');

    const explore = screen.getByRole('link', { name: 'Explore Main Mongo' });
    expect(explore).toHaveAttribute('href', '/databases/explore/db-1');
  });

  it('keeps database runtime actions touch-friendly on mobile', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        databases: [
          {
            id: 'db-1',
            name: 'Main Mongo',
            slug: 'main-mongo',
            templateId: 'mongo',
            version: '8',
            image: 'mongo:8',
            host: '127.0.0.1',
            port: 27017,
            internalPort: 27017,
            username: 'root',
            databaseName: 'appdb',
            dataPath: '/var/lib/servermon/databases/main-mongo/data',
            publicRoute: false,
            bindAddress: '127.0.0.1',
            sslMode: 'disable',
            restartPolicy: 'unless-stopped',
            status: 'running',
            connection: {
              maskedUri: 'mongodb://root:********@127.0.0.1:27017/appdb?authSource=admin',
              cli: 'mongodb://root:********@127.0.0.1:27017/appdb?authSource=admin',
            },
            explorer: { status: 'stopped', kind: 'mongo-express' },
            securityNotes: [],
            logs: [],
          },
        ],
      }),
    } as Response);

    render(<DatabasesPage />);
    await screen.findByText('Main Mongo');

    const deploy = screen.getByRole('button', { name: 'Deploy Main Mongo' });
    const explore = screen.getByRole('link', { name: 'Explore Main Mongo' });
    const stop = screen.getByRole('button', { name: 'Stop' });

    for (const action of [deploy, explore, stop]) {
      expect(action).toHaveClass('h-11');
      expect(action).toHaveClass('w-full');
      expect(action).toHaveClass('sm:h-8');
      expect(action).toHaveClass('sm:w-auto');
    }
  });

  it('copies the masked connection string from an explicit copy action', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        databases: [
          {
            id: 'db-1',
            name: 'Main Postgres',
            slug: 'main-postgres',
            templateId: 'postgres',
            version: '17',
            image: 'postgres:17',
            host: '127.0.0.1',
            port: 5432,
            internalPort: 5432,
            username: 'servermon',
            databaseName: 'servermon',
            dataPath: '/var/lib/servermon/databases/main-postgres/data',
            publicRoute: false,
            bindAddress: '127.0.0.1',
            sslMode: 'disable',
            restartPolicy: 'unless-stopped',
            status: 'running',
            connection: {
              maskedUri: 'postgresql://servermon:********@127.0.0.1:5432/servermon',
              cli: 'psql "postgresql://servermon:********@127.0.0.1:5432/servermon"',
            },
            securityNotes: [],
            logs: [],
          },
        ],
      }),
    } as Response);

    render(<DatabasesPage />);
    await screen.findByText('Main Postgres');

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy connection string for Main Postgres' })
    );

    expect(writeText).toHaveBeenCalledWith(
      'postgresql://servermon:********@127.0.0.1:5432/servermon'
    );
    expect(await screen.findByText('Copied')).toBeTruthy();
  });

  it('shows deployment activity immediately after deploy is clicked', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          databases: [
            {
              id: 'db-1',
              name: 'Main Mongo',
              slug: 'main-mongo',
              templateId: 'mongo',
              version: '8',
              image: 'mongo:8',
              host: '127.0.0.1',
              port: 27017,
              internalPort: 27017,
              username: 'root',
              databaseName: 'defaultdb',
              dataPath: '/var/lib/servermon/databases/main-mongo/data',
              publicRoute: false,
              bindAddress: '127.0.0.1',
              sslMode: 'disable',
              restartPolicy: 'unless-stopped',
              status: 'draft',
              connection: {
                maskedUri: 'mongodb://root:********@127.0.0.1:27017/defaultdb?authSource=admin',
                cli: 'mongodb://root:********@127.0.0.1:27017/defaultdb?authSource=admin',
              },
              securityNotes: [],
              logs: [],
            },
          ],
        }),
      } as Response)
      .mockImplementationOnce(() => new Promise(() => undefined));

    render(<DatabasesPage />);
    await screen.findByText('Main Mongo');

    fireEvent.click(screen.getByRole('button', { name: 'Deploy Main Mongo' }));

    expect(await screen.findByText(/Deploy request sent to ServerMon/i)).toBeTruthy();
    expect(screen.getByText(/Pulling the Docker image/i)).toBeTruthy();
    expect(screen.getByText('Deploying')).toBeTruthy();
  });
});
