import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { 
  InAppNotificationBanner, 
  InAppNotification, 
  addNotificationListener,
  showInAppNotification 
} from "@/components/in-app-notification";
import { trpc } from "@/lib/trpc";
import { useAuthContext } from "@/lib/auth-context";

interface NotificationContextType {
  showNotification: (notification: Omit<InAppNotification, "id" | "timestamp">) => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType>({
  showNotification: () => {},
  unreadCount: 0,
});

export function useNotifications() {
  return useContext(NotificationContext);
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [currentNotification, setCurrentNotification] = useState<InAppNotification | null>(null);
  const [notificationQueue, setNotificationQueue] = useState<InAppNotification[]>([]);
  const { isAuthenticated, user } = useAuthContext();

  // Get unread notifications count
  const { data: notifications } = trpc.notifications.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  // Poll for friend ride starts
  const { data: friendsRiding } = trpc.liveLocation.friends.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 10000, // Poll every 10 seconds
  });

  // Track which friends we've already notified about
  const [notifiedFriends, setNotifiedFriends] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (friendsRiding) {
      friendsRiding.forEach((friend) => {
        // Consider riding if speed > 0 or location was updated recently (within 5 minutes)
        const isRiding = (friend.speed && friend.speed > 0) || 
          (friend.updatedAt && new Date().getTime() - new Date(friend.updatedAt).getTime() < 5 * 60 * 1000);
        
        if (isRiding && !notifiedFriends.has(friend.userId)) {
          // Show notification for friend starting ride
          showInAppNotification({
            type: "ride_started",
            title: "친구 주행 중",
            body: `${friend.name || "친구"}님이 주행 중입니다`,
            data: { userId: friend.userId },
          });
          setNotifiedFriends(prev => new Set(prev).add(friend.userId));
        } else if (!isRiding && notifiedFriends.has(friend.userId)) {
          // Remove from notified set when they stop riding
          setNotifiedFriends(prev => {
            const next = new Set(prev);
            next.delete(friend.userId);
            return next;
          });
        }
      });
    }
  }, [friendsRiding, notifiedFriends]);

  // Poll for new notifications from server
  const { data: serverNotifications } = trpc.notifications.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 15000, // Poll every 15 seconds
  });

  const [lastNotificationId, setLastNotificationId] = useState<number | null>(null);

  useEffect(() => {
    if (serverNotifications && serverNotifications.length > 0) {
      const latestNotification = serverNotifications[0];
      
      // Check if this is a new notification we haven't shown yet
      if (lastNotificationId !== null && latestNotification.id > lastNotificationId && !latestNotification.isRead) {
        // Map server notification type to in-app notification type
        let type: InAppNotification["type"] = "general";
        switch (latestNotification.type) {
          case "friend_request":
            type = "friend_request";
            break;
          case "friend_accepted":
            type = "friend_accepted";
            break;
          case "challenge_invite":
            type = "challenge_invite";
            break;
          case "comment":
            type = "comment";
            break;
          case "like":
            type = "like";
            break;
          case "group_invite":
            type = "group_invite";
            break;
        }

        showInAppNotification({
          type,
          title: latestNotification.title,
          body: latestNotification.body || "",
          data: latestNotification.entityId ? { entityId: latestNotification.entityId, entityType: latestNotification.entityType } : undefined,
        });
      }
      
      setLastNotificationId(latestNotification.id);
    }
  }, [serverNotifications, lastNotificationId]);

  // Listen for programmatic notifications
  useEffect(() => {
    const unsubscribe = addNotificationListener((notification) => {
      setNotificationQueue(prev => [...prev, notification]);
    });
    return () => { unsubscribe(); };
  }, []);

  // Process notification queue
  useEffect(() => {
    if (!currentNotification && notificationQueue.length > 0) {
      const [next, ...rest] = notificationQueue;
      setCurrentNotification(next);
      setNotificationQueue(rest);
    }
  }, [currentNotification, notificationQueue]);

  const handleDismiss = useCallback(() => {
    setCurrentNotification(null);
  }, []);

  const showNotification = useCallback((notification: Omit<InAppNotification, "id" | "timestamp">) => {
    showInAppNotification(notification);
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification, unreadCount }}>
      {children}
      <InAppNotificationBanner
        notification={currentNotification}
        onDismiss={handleDismiss}
      />
    </NotificationContext.Provider>
  );
}
