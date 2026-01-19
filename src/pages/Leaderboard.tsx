import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { motion } from 'framer-motion';
import { Trophy, Medal, Award, TrendingUp, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { User } from '@/data/mockData';
import { getAllUsers } from '@/lib/userProfile';
import { Link } from 'react-router-dom';

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Trophy className="h-6 w-6 text-yellow-500" />;
    case 2:
      return <Medal className="h-6 w-6 text-gray-400" />;
    case 3:
      return <Award className="h-6 w-6 text-amber-600" />;
    default:
      return <span className="text-lg font-bold text-muted-foreground">#{rank}</span>;
  }
};

const getRankStyle = (rank: number) => {
  switch (rank) {
    case 1:
      return 'bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border-yellow-500/30';
    case 2:
      return 'bg-gradient-to-r from-gray-300/10 to-gray-400/10 border-gray-400/30';
    case 3:
      return 'bg-gradient-to-r from-amber-500/10 to-amber-600/10 border-amber-600/30';
    default:
      return 'hover:bg-muted/50';
  }
};

const Leaderboard = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const allUsers = await getAllUsers();
        setUsers(Array.isArray(allUsers) ? allUsers : []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const rankedUsers = Array.isArray(users)
    ? users
        .sort((a, b) => (b.points || 0) - (a.points || 0))
        .map((user, index) => ({ ...user, rank: index + 1 }))
    : [];

  const filteredUsers = rankedUsers.filter(user =>
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-primary" />
              Community Leaderboard
            </h1>
            <p className="text-muted-foreground">
              Top contributors in our AWS community
            </p>
          </div>

          <Card className="glass-card mb-6">
            <CardHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
          </Card>

          {loading ? (
            <Card className="glass-card">
              <CardContent className="p-8">
                <div className="space-y-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-lg border animate-pulse">
                      <div className="w-10 h-10 bg-muted rounded" />
                      <div className="h-12 w-12 bg-muted rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-40" />
                        <div className="h-3 bg-muted rounded w-32" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-5 bg-muted rounded w-20" />
                        <div className="h-3 bg-muted rounded w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : filteredUsers.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">
                  {searchQuery ? 'No users found matching your search.' : 'No users found.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <motion.div
                      key={user.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Link
                        to={`/profile/${user.id}`}
                        className={`flex items-center gap-4 p-4 rounded-lg border transition-all hover:scale-[1.01] ${getRankStyle(user.rank)}`}
                      >
                        <div className="flex items-center justify-center w-10">
                          {getRankIcon(user.rank)}
                        </div>
                        <Avatar className="h-12 w-12 border-2 border-border">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback>{user.name?.charAt(0) || '?'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-lg truncate">{user.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {user.badges?.length || 0} badges earned
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-xl text-primary">{(user.points || 0).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">points</p>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default Leaderboard;
